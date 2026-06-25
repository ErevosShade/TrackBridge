const axios = require('axios');

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * Silently refreshes an expired Spotify token before the request continues.
 */
async function refreshSpotifyIfNeeded(session) {
  if (!session.spotify) return false;
  if (Date.now() < session.spotify.expiresAt - 60_000) return true;

  try {
    const creds = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const { data } = await axios.post(
      SPOTIFY_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.spotify.refreshToken,
      }),
      { headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    session.spotify.accessToken = data.access_token;
    session.spotify.expiresAt = Date.now() + data.expires_in * 1000;
    if (data.refresh_token) session.spotify.refreshToken = data.refresh_token;
    return true;
  } catch {
    return false;
  }
}

/**
 * Silently refreshes an expired YouTube token before the request continues.
 */
async function refreshYouTubeIfNeeded(session) {
  if (!session.youtube) return false;
  if (Date.now() < session.youtube.expiresAt - 60_000) return true;

  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: session.youtube.refreshToken,
      grant_type: 'refresh_token',
    });

    session.youtube.accessToken = data.access_token;
    session.youtube.expiresAt = Date.now() + data.expires_in * 1000;
    return true;
  } catch {
    return false;
  }
}

/**
 * Middleware: requires Spotify session. Refreshes token automatically.
 */
function requireSpotify(req, res, next) {
  refreshSpotifyIfNeeded(req.session).then((ok) => {
    if (!ok) return res.status(401).json({ error: 'Spotify not connected' });
    next();
  });
}

/**
 * Middleware: requires YouTube session. Refreshes token automatically.
 */
function requireYouTube(req, res, next) {
  refreshYouTubeIfNeeded(req.session).then((ok) => {
    if (!ok) return res.status(401).json({ error: 'YouTube not connected' });
    next();
  });
}

module.exports = { requireSpotify, requireYouTube, refreshSpotifyIfNeeded, refreshYouTubeIfNeeded };
