const express = require('express');
const axios   = require('axios');
const { nanoid } = require('nanoid');
const { refreshSpotifyIfNeeded, refreshYouTubeIfNeeded } = require('../middleware/requireAuth');
const quota  = require('../utils/quotaGuard');
const cache  = require('../utils/searchCache');
const router = express.Router();

// In-memory job store (swap for Redis in production)
const jobs = new Map();

// ── Delay helper ──────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────────────────────
// SPOTIFY helpers  (no quota cost — Spotify has no hard unit limit)
// ─────────────────────────────────────────────────────────────

async function searchSpotifyTrack(name, artist, accessToken, exactOnly) {
  // Check cache first
  const cached = cache.get('spotify', name, artist);
  if (cached !== null) return cached;

  const q = exactOnly
    ? `track:"${name}" artist:"${artist}"`
    : `${name} ${artist}`;

  const { data } = await axios.get('https://api.spotify.com/v1/search', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params:  { q, type: 'track', limit: 1 },
  });

  const item = data.tracks?.items?.[0];
  if (!item) { cache.set('spotify', name, artist, null); return null; }

  const nameLower   = name.toLowerCase();
  const resultName  = item.name.toLowerCase();
  const exact       = resultName === nameLower || resultName.includes(nameLower);
  const result      = { id: item.uri, matchStatus: exact ? 'found' : 'fuzzy' };

  cache.set('spotify', name, artist, result);
  return result;
}

async function createSpotifyPlaylist(name, isPublic, accessToken) {
  const { data: me } = await axios.get('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const { data } = await axios.post(
    `https://api.spotify.com/v1/users/${me.id}/playlists`,
    { name, public: isPublic, description: 'Transferred via trackbridge' },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  return data.id;
}

async function addTracksToSpotify(playlistId, uris, accessToken) {
  // Spotify max 100 per request — batch it
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: chunk },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    await sleep(200); // gentle pacing
  }
}

// ─────────────────────────────────────────────────────────────
// YOUTUBE helpers  (every call tracked against quota)
// ─────────────────────────────────────────────────────────────

/**
 * Smart YouTube track search.
 *
 * Strategy (cheapest first):
 *   1. Cache hit          →   0 units
 *   2. videos.list lookup →   1 unit  (only works if we already have a videoId)
 *   3. search.list        → 100 units (last resort)
 *
 * For Spotify→YouTube transfers, we always go to step 3 since we only
 * have track names. We add a 350ms delay between searches so we never
 * burst more than ~3 calls/sec.
 */
async function searchYouTubeTrack(name, artist, accessToken) {
  // 1. Cache
  const cached = cache.get('youtube', name, artist);
  if (cached !== null) return cached;

  // 2. Quota check — search.list costs 100 units
  if (!quota.canAfford(quota.COSTS.searchList)) {
    console.warn(`[quota] Not enough units for search: "${name}". Skipping.`);
    return null;
  }

  // 3. search.list — most accurate but expensive
  const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params:  {
      part:            'snippet',
      q:               `${name} ${artist} official audio`,
      type:            'video',
      videoCategoryId: '10', // Music
      maxResults:      1,
    },
  });

  quota.spend(quota.COSTS.searchList);

  const item = data.items?.[0];
  if (!item) { cache.set('youtube', name, artist, null); return null; }

  const result = { id: item.id.videoId, matchStatus: 'found' };
  cache.set('youtube', name, artist, result);
  return result;
}

async function createYouTubePlaylist(name, isPublic, accessToken) {
  if (!quota.canAfford(quota.COSTS.playlistsInsert)) {
    throw new Error('YouTube quota exhausted — cannot create playlist');
  }
  try {
    const { data } = await axios.post(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
      {
        snippet: { title: name, description: 'Transferred via trackbridge' },
        status:  { privacyStatus: isPublic ? 'public' : 'private' },
      },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    quota.spend(quota.COSTS.playlistsInsert);
    return data.id;
  } catch (err) {
    console.error('❌ YouTube createPlaylist failed');
    console.error('Status:', err.response?.status);
    console.error('Full error body:', JSON.stringify(err.response?.data));
    console.error('Token (first 15 chars):', accessToken?.slice(0, 15));
    throw err;
  }
}

async function addVideoToYouTube(playlistId, videoId, accessToken) {
  if (!quota.canAfford(quota.COSTS.playlistItemsInsert)) {
    throw new Error('YouTube quota exhausted — cannot add track');
  }
  await axios.post(
    'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
    {
      snippet: {
        playlistId,
        resourceId: { kind: 'youtube#video', videoId },
      },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  quota.spend(quota.COSTS.playlistItemsInsert);
}

// ── SSE helper ────────────────────────────────────────────────

function sendSSE(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ─────────────────────────────────────────────────────────────
// POST /api/transfer/scan  — search-only pre-check, no writes
// ─────────────────────────────────────────────────────────────

router.post('/scan', async (req, res) => {
  const { from, to, tracks, options } = req.body;

  if (!from || !to || !tracks?.length) {
    return res.status(400).json({ error: 'from, to, tracks required' });
  }

  const jobId = nanoid();

  jobs.set(jobId, {
    jobId,
    kind: 'scan',
    from,
    to,
    tracks,
    options: options || {},
    status:   'queued',
    progress: 0,
    result:   null,
  });

  res.json({ jobId });
});

// ─────────────────────────────────────────────────────────────
// GET /api/transfer/scan-stream/:jobId  (SSE) — search every track,
// report a per-track match result, but never create a playlist or
// write anything to either platform.
// ─────────────────────────────────────────────────────────────

router.get('/scan-stream/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.kind !== 'scan') return res.status(404).json({ error: 'Scan job not found' });

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => clearInterval(heartbeat));

  job.status = 'running';
  const { from, to, tracks, options } = job;

  try {
    if (from === 'spotify' || to === 'spotify') {
      const ok = await refreshSpotifyIfNeeded(req.session);
      if (!ok) { sendSSE(res, { type: 'error', error: 'Spotify not connected' }); return res.end(); }
    }
    if (from === 'youtube' || to === 'youtube') {
      const ok = await refreshYouTubeIfNeeded(req.session);
      if (!ok) { sendSSE(res, { type: 'error', error: 'YouTube not connected' }); return res.end(); }
    }

    const spToken = req.session.spotify?.accessToken;
    const ytToken = req.session.youtube?.accessToken;

    if (to === 'youtube' || from === 'youtube') {
      sendSSE(res, { type: 'quota_info', quotaStats: quota.getStats() });
    }

    const total = tracks.length;
    let matched = 0, fuzzy = 0, missed = 0;

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      let match = null;

      try {
        if (to === 'spotify') {
          match = await searchSpotifyTrack(track.name, track.artist, spToken, options?.exactMatchOnly ?? true);
          await sleep(80);
        } else {
          if (!quota.canAfford(quota.COSTS.searchList)) {
            sendSSE(res, {
              type: 'quota_stop',
              done: i,
              total,
              remaining: quota.remaining(),
              message: `Quota limit reached after scanning ${i} tracks.`,
            });
            break;
          }
          match = await searchYouTubeTrack(track.name, track.artist, ytToken);
          await sleep(150);
        }
      } catch (e) {
        console.error(`❌ Scan search error for "${track.name}":`, e.response?.data || e.message);
      }

      const matchStatus = match ? match.matchStatus : 'miss';
      if (matchStatus === 'found') matched++;
      else if (matchStatus === 'fuzzy') fuzzy++;
      else missed++;

      sendSSE(res, {
        type:        'track_scanned',
        done:         i + 1,
        total,
        trackId:     track.id,
        trackName:   track.name,
        matchStatus,
        matched, fuzzy, missed,
        quotaLeft:   to === 'youtube' ? quota.remaining() : null,
      });

      job.progress = Math.round(((i + 1) / total) * 100);
    }

    job.status = 'done';
    job.result = { matched, fuzzy, missed, total };

    sendSSE(res, { type: 'scan_complete', matched, fuzzy, missed, total });

  } catch (err) {
    console.error('❌ Scan error');
    console.error('Status:', err.response?.status);
    console.error('Response data:', JSON.stringify(err.response?.data));
    console.error('Stack:', err.stack);
    job.status = 'error';
    sendSSE(res, { type: 'error', error: err.response?.data?.error?.message || err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/transfer/start
// ─────────────────────────────────────────────────────────────

router.post('/start', async (req, res) => {
  const { from, to, tracks, playlistName, options, recipientEmail } = req.body;

  if (!from || !to || !tracks?.length) {
    return res.status(400).json({ error: 'from, to, tracks required' });
  }

  // Pre-flight quota check for YouTube destinations
  if (to === 'youtube') {
    // Worst case: 1 playlist create (50) + N searches (100 each) + N inserts (50 each)
    const worstCase = quota.COSTS.playlistsInsert
      + tracks.length * (quota.COSTS.searchList + quota.COSTS.playlistItemsInsert);

    const stats = quota.getStats();

    if (stats.remaining < quota.COSTS.playlistsInsert) {
      return res.status(429).json({
        error: 'YouTube API quota exhausted for today. Resets at midnight Pacific time.',
        quotaStats: stats,
      });
    }

    // Warn if we can only partially complete
    const maxTracks = Math.floor(
      (stats.remaining - quota.COSTS.playlistsInsert) /
      (quota.COSTS.searchList + quota.COSTS.playlistItemsInsert)
    );

    if (maxTracks < tracks.length) {
      console.warn(`[quota] Can only transfer ${maxTracks}/${tracks.length} tracks today`);
    }
  }

  const jobId      = nanoid();
  const shareToken = nanoid(12);

  jobs.set(jobId, {
    jobId,
    from,
    to,
    tracks,
    playlistName: playlistName || 'Transferred Playlist',
    options:      options || {},
    recipientEmail: recipientEmail || null,
    shareToken,
    status:   'queued',
    progress: 0,
    result:   null,
  });

  res.json({ jobId, shareToken });
});

// ─────────────────────────────────────────────────────────────
// GET /api/transfer/stream/:jobId  (SSE)
// ─────────────────────────────────────────────────────────────

router.get('/stream/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // SSE headers
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => clearInterval(heartbeat));

  job.status = 'running';
  const { from, to, tracks, playlistName, options } = job;

  try {
    // Refresh tokens
    if (from === 'spotify' || to === 'spotify') {
      const ok = await refreshSpotifyIfNeeded(req.session);
      if (!ok) { sendSSE(res, { type: 'error', error: 'Spotify not connected' }); return res.end(); }
    }
    if (from === 'youtube' || to === 'youtube') {
      const ok = await refreshYouTubeIfNeeded(req.session);
      if (!ok) { sendSSE(res, { type: 'error', error: 'YouTube not connected' }); return res.end(); }
    }

    const spToken = req.session.spotify?.accessToken;
    const ytToken = req.session.youtube?.accessToken;

    // Send initial quota snapshot to client
    if (to === 'youtube' || from === 'youtube') {
      sendSSE(res, { type: 'quota_info', quotaStats: quota.getStats() });
    }

    // Create destination playlist
    let destPlaylistId;
    if (to === 'spotify') {
      destPlaylistId = await createSpotifyPlaylist(playlistName, options.makePublic, spToken);
    } else {
      destPlaylistId = await createYouTubePlaylist(playlistName, options.makePublic, ytToken);
    }

    const matchedUris = [];
    const total       = tracks.length;
    let   quotaStopped = false;

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      let   match = null;

      try {
        if (to === 'spotify') {
          match = await searchSpotifyTrack(track.name, track.artist, spToken, options.exactMatchOnly);
          await sleep(100); // gentle Spotify pacing
        } else {
          // Check quota before each YouTube search
          if (!quota.canAfford(quota.COSTS.searchList)) {
            quotaStopped = true;
            sendSSE(res, {
              type:       'quota_stop',
              done:        i,
              total,
              remaining:   quota.remaining(),
              message:    `Quota limit reached after ${i} tracks. Transfer paused — resumes tomorrow.`,
            });
            break;
          }

          match = await searchYouTubeTrack(track.name, track.artist, ytToken);
          // 350ms between YouTube searches → ~2.8 searches/sec max
          await sleep(350);
        }
      } catch (e) {
        console.error(`Track search error for "${track.name}":`, e.message);
      }

      if (match) {
        matchedUris.push(match.id);

        if (to === 'youtube') {
          try {
            await addVideoToYouTube(destPlaylistId, match.id, ytToken);
            await sleep(200); // pacing between inserts
          } catch (e) {
            if (e.message.includes('quota')) {
              quotaStopped = true;
              sendSSE(res, {
                type:      'quota_stop',
                done:       i + 1,
                total,
                remaining:  quota.remaining(),
                message:   `Quota exhausted adding track. ${i + 1} tracks transferred.`,
              });
              break;
            }
          }
        }

        sendSSE(res, {
          type:        'track_done',
          done:         i + 1,
          total,
          trackName:   track.name,
          matchStatus: match.matchStatus,
          quotaLeft:   to === 'youtube' ? quota.remaining() : null,
        });
      } else {
        sendSSE(res, {
          type:      'track_miss',
          done:       i + 1,
          total,
          trackName: track.name,
          quotaLeft: to === 'youtube' ? quota.remaining() : null,
        });
      }

      job.progress = Math.round(((i + 1) / total) * 100);
    }

    // Batch-add for Spotify (YouTube adds one-by-one above)
    if (to === 'spotify' && matchedUris.length) {
      await addTracksToSpotify(destPlaylistId, matchedUris, spToken);
    }

    job.status = 'done';
    job.result = { destPlaylistId, matched: matchedUris.length, total };

    sendSSE(res, {
      type:          'complete',
      matched:        matchedUris.length,
      missed:         total - matchedUris.length,
      total,
      quotaStopped,
      destPlaylistId,
      shareToken:    job.shareToken,
      quotaStats:    quota.getStats(),
    });

  } catch (err) {
    console.error('❌ Transfer error');
    console.error('Status:', err.response?.status);
    console.error('Response data:', JSON.stringify(err.response?.data));
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    job.status = 'error';
    const userMessage = err.response?.data?.error?.message || err.message;
    sendSSE(res, { type: 'error', error: userMessage });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/transfer/status/:jobId
// ─────────────────────────────────────────────────────────────

router.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json({ status: job.status, progress: job.progress, result: job.result });
});

// ─────────────────────────────────────────────────────────────
// GET /api/transfer/quota  — check remaining quota anytime
// ─────────────────────────────────────────────────────────────

router.get('/quota', (_req, res) => {
  res.json(quota.getStats());
});

module.exports = router;