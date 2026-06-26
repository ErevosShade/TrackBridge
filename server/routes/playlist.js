const express = require('express');
const axios = require('axios');
const { refreshSpotifyIfNeeded, refreshYouTubeIfNeeded } = require('../middleware/requireAuth');
const quota = require('../utils/quotaGuard');
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

function getSpotifyTrackItem(entry) {
  return entry.item?.track || entry.item || entry.track?.track || entry.track || null;
}

async function fetchSpotifyPlaylist(playlistId, accessToken) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  // Fetch playlist metadata
  let meta;
  try {
    const { data } = await axios.get(
      `https://api.spotify.com/v1/playlists/${playlistId}`,
      {
        headers,
        params: {
          fields: "id,name,owner.id,owner.display_name,images,tracks(total)",
        },
      }
    );

    meta = data;
  } catch (err) {
    console.error("❌ Spotify playlist metadata request failed");
    console.error("Status:", err.response?.status);
    console.error("URL:", err.config?.url);
    console.error("Response:", err.response?.data);

    const status = err.response?.status;
    const message = status === 403
      ? '[metadata call] Spotify returned 403 Forbidden fetching playlist metadata (GET /v1/playlists/{id}). This usually means: the connected Spotify account is not added under "Users and Access" for this app in the Spotify Developer Dashboard, OR the access token is missing a required scope. Check /auth/debug/spotify for token + scope details.'
      : err.response?.data?.error?.message || err.response?.data?.message || 'Failed to fetch Spotify playlist metadata';

    const enriched = new Error(message);
    enriched.response = err.response;
    throw enriched;
  }

  const tracks = [];
  let url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=50`;
  let triedTracksEndpoint = false;

  while (url) {
    try {
      const { data } = await axios.get(url, { headers });

      for (const entry of data.items || []) {
        const item = getSpotifyTrackItem(entry);
        if (!item || item.type !== 'track') continue;

        tracks.push({
          id: item.id,
          name: item.name,
          artist: item.artists.map((a) => a.name).join(", "),
          album: item.album?.name || "",
          duration_ms: item.duration_ms,
          thumbnail: item.album?.images?.[2]?.url || null,
        });
      }

      url = data.next;
    } catch (err) {
      const status = err.response?.status;
      const urlFailed = url;
      if (!triedTracksEndpoint && status === 403) {
        console.warn('⚠️ Spotify /items endpoint forbidden; retrying deprecated /tracks endpoint');
        url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;
        triedTracksEndpoint = true;
        continue;
      }

      console.error("❌ Spotify playlist tracks request failed");
      console.error("Status:", status);
      console.error("URL:", urlFailed);
      console.error("Response:", err.response?.data);

      const message = status === 403
        ? '[items call] Spotify returned 403 Forbidden. Common causes: (1) this Spotify account is not added under "Users and Access" for the app in the Spotify Developer Dashboard (Development Mode apps require every tester to be explicitly allowlisted), (2) the connected token is missing a required scope, or (3) the playlist is not owned by / shared with the connected account. Check /auth/debug/spotify for token + scope details.'
        : status === 404
        ? 'Spotify playlist not found.'
        : err.response?.data?.error?.message || err.response?.data?.message || 'Failed to fetch Spotify playlist tracks';

      const enriched = new Error(message);
      enriched.response = err.response;
      throw enriched;
    }
  }

  return {
    id: meta.id,
    name: meta.name,
    owner: meta.owner?.display_name || meta.owner?.id || 'Spotify',
    thumbnail: meta.images?.[0]?.url || null,
    images: meta.images,
    trackCount: meta.tracks.total,
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
  quota.spend(quota.COSTS.playlistsList);

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
    quota.spend(quota.COSTS.playlistItemsList);

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
    const status = err.response?.status || 500;
    const message = err.response?.data?.error?.message || err.response?.data?.message || 'Failed to fetch playlist';
    res.status(status).json({ error: message, details: err.response?.data });
  }
});

module.exports = router;