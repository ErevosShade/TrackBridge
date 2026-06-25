const express = require('express');
const { nanoid } = require('nanoid');
const router = express.Router();

// In-memory store (swap for DB in production)
const shareLinks = new Map();

// POST /api/share — create a shareable link for a completed transfer
router.post('/', (req, res) => {
  const { playlistName, destPlatform, destPlaylistId, trackCount } = req.body;
  if (!destPlaylistId) return res.status(400).json({ error: 'destPlaylistId required' });

  const token = nanoid(12);
  shareLinks.set(token, {
    token,
    playlistName,
    destPlatform,
    destPlaylistId,
    trackCount,
    createdAt: Date.now(),
  });

  const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
  res.json({ token, url: `${CLIENT_URL}/claim/${token}` });
});

// GET /api/share/:token — resolve a share token
router.get('/:token', (req, res) => {
  const link = shareLinks.get(req.params.token);
  if (!link) return res.status(404).json({ error: 'Link not found or expired' });
  res.json(link);
});

module.exports = router;
