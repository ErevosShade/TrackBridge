const express = require('express');
const axios = require('axios');
const { refreshSpotifyIfNeeded, refreshYouTubeIfNeeded } = require('../middleware/requireAuth');
const router = express.Router();

// ── Detect platform from URL ──────────────────────────────────

function detectPlatform(url) {
  if (/open\.spotify\.com\/playlist/.test(url)) return 'spotify';
  if (/youtube\.com\/playlist|youtu\.be/.test(url)) return 'youtube';
  return null;
}

function extractSpotifyId(url) {
  const match = url.match(/playlist\/([A-Za-z0-9]+)/);
  return match?.[1] || null;
}

function extractYouTubeId(url) {
  const match = url.match(/[?&]list=([^&]+)/);
  return match?.[1] || null;
}

// ── Spotify fetcher ───────────────────────────────────────────

async function fetchSpotifyPlaylist(playlistId, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const { data: meta } = await axios.get(
    `https://api.spotify.com/v1/playlists/${playlistId}`,
    { headers, params: { fields: 'id,name,owner,images,tracks(total)' } }
  );

  // Paginate all tracks (Spotify returns max 100 per page)
  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&fields=next,items(track(id,name,artists,album,duration_ms))`;

  while (url) {
    const { data } = await axios.get(url, { headers });
    for (const item of data.items) {
      if (!item.track) continue;
      const t = item.track;
      tracks.push({
        id: t.id,
        name: t.name,
        artist: t.artists.map((a) => a.name).join(', '),
        album: t.album?.name || '',
        duration_ms: t.duration_ms,
        thumbnail: t.album?.images?.[2]?.url || null,
      });
    }
    url = data.next;
  }

  return {
    id: meta.id,
    name: meta.name,
    owner: meta.owner?.display_name || meta.owner?.id,
    thumbnail: meta.images?.[0]?.url || null,
    trackCount: tracks.length,
    sourcePlatform: 'spotify',
    tracks,
  };
}

// ── YouTube fetcher ───────────────────────────────────────────

async function fetchYouTubePlaylist(playlistId, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const { data: meta } = await axios.get(
    'https://www.googleapis.com/youtube/v3/playlists',
    {
      headers,
      params: { part: 'snippet', id: playlistId, maxResults: 1 },
    }
  );

  const playlist = meta.items?.[0];
  if (!playlist) throw new Error('Playlist not found');

  const tracks = [];
  let pageToken = null;

  do {
    const params = {
      part: 'snippet',
      playlistId,
      maxResults: 50,
      ...(pageToken ? { pageToken } : {}),
    };

    const { data } = await axios.get(
      'https://www.googleapis.com/youtube/v3/playlistItems',
      { headers, params }
    );

    for (const item of data.items) {
      const s = item.snippet;
      if (s.title === 'Deleted video' || s.title === 'Private video') continue;
      tracks.push({
        id: s.resourceId.videoId,
        name: s.title,
        artist: s.videoOwnerChannelTitle || '',
        album: '',
        duration_ms: 0,
        thumbnail: s.thumbnails?.default?.url || null,
      });
    }

    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return {
    id: playlistId,
    name: playlist.snippet.title,
    owner: playlist.snippet.channelTitle,
    thumbnail: playlist.snippet.thumbnails?.high?.url || null,
    trackCount: tracks.length,
    sourcePlatform: 'youtube',
    tracks,
  };
}

// ── Route: GET /api/playlist?url=… ───────────────────────────

router.get('/', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url query param required' });

  const platform = detectPlatform(url);
  if (!platform) return res.status(400).json({ error: 'Unrecognised playlist URL' });

  try {
    if (platform === 'spotify') {
      const ok = await refreshSpotifyIfNeeded(req.session);
      if (!ok) return res.status(401).json({ error: 'Spotify not connected', platform });

      const id = extractSpotifyId(url);
      if (!id) return res.status(400).json({ error: 'Could not parse Spotify playlist ID' });

      const playlist = await fetchSpotifyPlaylist(id, req.session.spotify.accessToken);
      return res.json(playlist);
    }

    if (platform === 'youtube') {
      const ok = await refreshYouTubeIfNeeded(req.session);
      if (!ok) return res.status(401).json({ error: 'YouTube not connected', platform });

      const id = extractYouTubeId(url);
      if (!id) return res.status(400).json({ error: 'Could not parse YouTube playlist ID' });

      const playlist = await fetchYouTubePlaylist(id, req.session.youtube.accessToken);
      return res.json(playlist);
    }
  } catch (err) {
    console.error('Playlist fetch error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch playlist' });
  }
});

module.exports = router;
