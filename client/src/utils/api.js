const API_BASE  = '/api';
const AUTH_BASE = '/auth';

async function request(base, path, opts = {}) {
  const res = await fetch(`${base}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json();

  if (!res.ok) {
    let message = 'Request failed';
    if (data?.error) {
      message = typeof data.error === 'string'
        ? data.error
        : data.error.message || JSON.stringify(data.error);
    } else if (data?.message) {
      message = data.message;
    }
    throw new Error(message);
  }

  return data;
}

const api_  = (path, opts) => request(API_BASE,  path, opts);
const auth_ = (path, opts) => request(AUTH_BASE, path, opts);

export const api = {
  // Auth → /auth/*  (NOT /api/auth/*)
  getAuthStatus: () => auth_('/status').catch(() => ({ spotify: false, youtube: false })),
  logoutSpotify: () => fetch(`${AUTH_BASE}/spotify/logout`, { credentials: 'include' }),
  logoutYouTube: () => fetch(`${AUTH_BASE}/youtube/logout`, { credentials: 'include' }),

  // Playlist → /api/*
  fetchPlaylist: (url) => api_(`/playlist?url=${encodeURIComponent(url)}`),

  // Scan (pre-check matches, no writes) → /api/*
  scanTracks: (body) => api_('/transfer/scan', { method: 'POST', body: JSON.stringify(body) }),

  // Transfer → /api/*
  startTransfer: (body) => api_('/transfer/start', { method: 'POST', body: JSON.stringify(body) }),

  // Share → /api/*
  createShare: (body) => api_('/share', { method: 'POST', body: JSON.stringify(body) }),
  getShare: (token) => api_(`/share/${token}`),
};

/**
 * Opens an SSE stream for a scan job (search-only pre-check).
 * @param {string} jobId
 * @param {{ onEvent: Function, onError: Function, onComplete: Function }} handlers
 * @returns {() => void} cleanup function
 */
export function openScanStream(jobId, { onEvent, onError, onComplete }) {
  const es = new EventSource(`${API_BASE}/transfer/scan-stream/${jobId}`, { withCredentials: true });

  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
    if (event.type === 'scan_complete') { onComplete(event); es.close(); }
    if (event.type === 'error')         { onError(new Error(event.error)); es.close(); }
  };

  es.onerror = () => { onError(new Error('Scan stream disconnected')); es.close(); };

  return () => es.close();
}

/**
 * Opens an SSE stream for a transfer job.
 * @param {string} jobId
 * @param {{ onEvent: Function, onError: Function, onComplete: Function }} handlers
 * @returns {() => void} cleanup function
 */
export function openTransferStream(jobId, { onEvent, onError, onComplete }) {
  const es = new EventSource(`${API_BASE}/transfer/stream/${jobId}`, { withCredentials: true });

  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
    if (event.type === 'complete') { onComplete(event); es.close(); }
    if (event.type === 'error')    { onError(new Error(event.error)); es.close(); }
  };

  es.onerror = () => { onError(new Error('Stream disconnected')); es.close(); };

  return () => es.close();
}