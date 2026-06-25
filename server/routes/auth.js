const express = require('express');
const axios = require('axios');
const { nanoid } = require('nanoid');
const router = express.Router();

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' ');

// ── Spotify ───────────────────────────────────────────────────

router.get('/spotify', (req, res) => {
  const state = nanoid(16);
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    scope: SPOTIFY_SCOPES,
    state,
    show_dialog: 'false',
  });

  res.redirect(`${SPOTIFY_AUTH_URL}?${params}`);
});

router.get('/spotify/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

  if (error || state !== req.session.oauthState) {
    return res.redirect(`${CLIENT_URL}?auth_error=spotify`);
  }

  try {
    const creds = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const { data } = await axios.post(
      SPOTIFY_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
      {
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    req.session.spotify = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    res.redirect(`${CLIENT_URL}?auth_success=spotify`);
  } catch (err) {
    console.error('Spotify OAuth error:', err.response?.data || err.message);
    res.redirect(`${CLIENT_URL}?auth_error=spotify`);
  }
});

router.get('/spotify/refresh', async (req, res) => {
  if (!req.session.spotify?.refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const creds = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString('base64');

    const { data } = await axios.post(
      SPOTIFY_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: req.session.spotify.refreshToken,
      }),
      {
        headers: {
          Authorization: `Basic ${creds}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    req.session.spotify.accessToken = data.access_token;
    req.session.spotify.expiresAt = Date.now() + data.expires_in * 1000;
    if (data.refresh_token) req.session.spotify.refreshToken = data.refresh_token;

    res.json({ ok: true });
  } catch (err) {
    console.error('Spotify refresh error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

router.get('/spotify/logout', (req, res) => {
  delete req.session.spotify;
  res.json({ ok: true });
});

// ── YouTube / Google ──────────────────────────────────────────

router.get('/youtube', (req, res) => {
  const state = nanoid(16);
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  res.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

router.get('/youtube/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

  if (error || state !== req.session.oauthState) {
    return res.redirect(`${CLIENT_URL}?auth_error=youtube`);
  }

  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    req.session.youtube = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    res.redirect(`${CLIENT_URL}?auth_success=youtube`);
  } catch (err) {
    console.error('YouTube OAuth error:', err.response?.data || err.message);
    res.redirect(`${CLIENT_URL}?auth_error=youtube`);
  }
});

router.get('/youtube/refresh', async (req, res) => {
  if (!req.session.youtube?.refreshToken) {
    return res.status(401).json({ error: 'No refresh token' });
  }

  try {
    const { data } = await axios.post(GOOGLE_TOKEN_URL, {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: req.session.youtube.refreshToken,
      grant_type: 'refresh_token',
    });

    req.session.youtube.accessToken = data.access_token;
    req.session.youtube.expiresAt = Date.now() + data.expires_in * 1000;

    res.json({ ok: true });
  } catch (err) {
    console.error('YouTube refresh error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Refresh failed' });
  }
});

router.get('/youtube/logout', (req, res) => {
  delete req.session.youtube;
  res.json({ ok: true });
});

// ── Session status ────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({
    spotify: !!req.session.spotify?.accessToken,
    youtube: !!req.session.youtube?.accessToken,
  });
});

module.exports = router;
