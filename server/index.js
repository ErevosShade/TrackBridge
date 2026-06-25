require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { createClient } = require('redis');
const RedisStore = require('connect-redis').default;

const authRouter = require('./routes/auth');
const playlistRouter = require('./routes/playlist');
const transferRouter = require('./routes/transfer');
const shareRouter = require('./routes/share');

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

app.set('trust proxy', 1);

async function start() {
  const redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', (err) => console.error('Redis error:', err));
  await redisClient.connect();
 
  const sessionStore = new RedisStore({ client: redisClient, prefix: 'sess:' });
 
  // ── Middleware ────────────────────────────────────────────────
  app.use(cors({
    origin: CLIENT_URL,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }));
 
  // ── Routes ────────────────────────────────────────────────────
  app.use('/auth', authRouter);
  app.use('/api/playlist', playlistRouter);
  app.use('/api/transfer', transferRouter);
  app.use('/api/share', shareRouter);
 
  // Health check
  app.get('/health', (_req, res) => res.json({ ok: true }));
 
  app.listen(PORT, () => {
    console.log(`trackbridge server running on http://localhost:${PORT}`);
  });
}
 
start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});