const express = require('express');
const axios = require('axios');
const { nanoid } = require('nanoid');
const { refreshSpotifyIfNeeded, refreshYouTubeIfNeeded } = require('../middleware/requireAuth');
const router = express.Router();

// In-memory job store (swap for Redis in production)
const jobs = new Map();

// ── Track matching ────────────────────────────────────────────

async function searchSpotifyTrack(name, artist, accessToken, exactOnly) {
  const q = exactOnly
    ? `track:"${name}" artist:"${artist}"`
    : `${name} ${artist}`;

  const { data } = await axios.get('https://api.spotify.com/v1/search', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { q, type: 'track', limit: 1 },
  });

  const item = data.tracks?.items?.[0];
  if (!item) return null;

  const nameLower = name.toLowerCase();
  const resultName = item.name.toLowerCase();
  const exact = resultName === nameLower || resultName.includes(nameLower);

  return { id: item.uri, matchStatus: exact ? 'found' : 'fuzzy' };
}

async function searchYouTubeTrack(name, artist, accessToken) {
  const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      part: 'snippet',
      q: `${name} ${artist} official audio`,
      type: 'video',
      videoCategoryId: '10', // Music
      maxResults: 1,
    },
  });

  const item = data.items?.[0];
  if (!item) return null;
  return { id: item.id.videoId, matchStatus: 'found' };
}

async function createSpotifyPlaylist(name, isPublic, accessToken) {
  // Get current user's id
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
  // Spotify allows max 100 per request
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100);
    await axios.post(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks`,
      { uris: chunk },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
  }
}

async function createYouTubePlaylist(name, isPublic, accessToken) {
  const { data } = await axios.post(
    'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
    {
      snippet: { title: name, description: 'Transferred via trackbridge' },
      status: { privacyStatus: isPublic ? 'public' : 'private' },
    },
    { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
  );
  return data.id;
}

async function addVideoToYouTube(playlistId, videoId, accessToken) {
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
}

// ── SSE helper ────────────────────────────────────────────────

function sendSSE(res, event) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ── POST /api/transfer/start ──────────────────────────────────
// Creates a job, returns { jobId }

router.post('/start', async (req, res) => {
  const { from, to, tracks, playlistName, options, recipientEmail } = req.body;

  if (!from || !to || !tracks?.length) {
    return res.status(400).json({ error: 'from, to, tracks required' });
  }

  const jobId = nanoid();
  const shareToken = nanoid(12);

  jobs.set(jobId, {
    jobId,
    from,
    to,
    tracks,
    playlistName: playlistName || 'Transferred Playlist',
    options: options || {},
    recipientEmail: recipientEmail || null,
    shareToken,
    status: 'queued',
    progress: 0,
    result: null,
  });

  res.json({ jobId, shareToken });
});

// ── GET /api/transfer/stream/:jobId ──────────────────────────
// SSE stream — client connects here to get live progress

router.get('/stream/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20_000);
  req.on('close', () => clearInterval(heartbeat));

  job.status = 'running';
  const { from, to, tracks, playlistName, options } = job;

  try {
    // Ensure tokens are fresh
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

    // Create destination playlist
    let destPlaylistId;
    if (to === 'spotify') {
      destPlaylistId = await createSpotifyPlaylist(playlistName, options.makePublic, spToken);
    } else {
      destPlaylistId = await createYouTubePlaylist(playlistName, options.makePublic, ytToken);
    }

    const matchedUris = [];
    const total = tracks.length;

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      let match = null;

      try {
        if (to === 'spotify') {
          match = await searchSpotifyTrack(track.name, track.artist, spToken, options.exactMatchOnly);
        } else {
          match = await searchYouTubeTrack(track.name, track.artist, ytToken);
        }
      } catch (e) {
        // Track search failed — count as miss, continue
      }

      if (match) {
        matchedUris.push(match.id);

        // Add immediately for YouTube (rate-limit friendly); batch for Spotify
        if (to === 'youtube') {
          try { await addVideoToYouTube(destPlaylistId, match.id, ytToken); } catch (_) {}
        }

        sendSSE(res, { type: 'track_done', done: i + 1, total, trackName: track.name, matchStatus: match.matchStatus });
      } else {
        sendSSE(res, { type: 'track_miss', done: i + 1, total, trackName: track.name });
      }

      job.progress = Math.round(((i + 1) / total) * 100);

      // Small delay to avoid hammering APIs
      await new Promise((r) => setTimeout(r, 120));
    }

    // Batch-add for Spotify
    if (to === 'spotify' && matchedUris.length) {
      await addTracksToSpotify(destPlaylistId, matchedUris, spToken);
    }

    job.status = 'done';
    job.result = { destPlaylistId, matched: matchedUris.length, total };

    sendSSE(res, {
      type: 'complete',
      matched: matchedUris.length,
      missed: total - matchedUris.length,
      total,
      destPlaylistId,
      shareToken: job.shareToken,
    });
  } catch (err) {
    console.error('Transfer error:', err.response?.data || err.message);
    job.status = 'error';
    sendSSE(res, { type: 'error', error: err.message });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// ── GET /api/transfer/status/:jobId ──────────────────────────

router.get('/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json({ status: job.status, progress: job.progress, result: job.result });
});

module.exports = router;
