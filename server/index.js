require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const path = require('path');

const authRouter = require('./routes/auth');
const playlistRouter = require('./routes/playlist');
const transferRouter = require('./routes/transfer');
const shareRouter = require('./routes/share');

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
}));

// ── Routes ────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/api/playlist', playlistRouter);
app.use('/api/transfer', transferRouter);
app.use('/api/share', shareRouter);

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// ── Serve built client in production ─────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`trackbridge server running on http://localhost:${PORT}`);
});
