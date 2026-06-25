const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Auth
  getAuthStatus: () => request('/auth/status', { credentials: 'include' }).catch(() => ({ spotify: false, youtube: false })),
  logoutSpotify: () => fetch('/auth/spotify/logout', { credentials: 'include' }),
  logoutYouTube: () => fetch('/auth/youtube/logout', { credentials: 'include' }),

  // Playlist
  fetchPlaylist: (url) => request(`/playlist?url=${encodeURIComponent(url)}`),

  // Transfer
  startTransfer: (body) => request('/transfer/start', { method: 'POST', body: JSON.stringify(body) }),

  // Share
  createShare: (body) => request('/share', { method: 'POST', body: JSON.stringify(body) }),
  getShare: (token) => request(`/share/${token}`),
};

/**
 * Opens an SSE stream for a transfer job.
 * @param {string} jobId
 * @param {{ onEvent: Function, onError: Function, onComplete: Function }} handlers
 * @returns {() => void} cleanup function
 */
export function openTransferStream(jobId, { onEvent, onError, onComplete }) {
  const es = new EventSource(`/api/transfer/stream/${jobId}`, { withCredentials: true });

  es.onmessage = (e) => {
    const event = JSON.parse(e.data);
    onEvent(event);
    if (event.type === 'complete') { onComplete(event); es.close(); }
    if (event.type === 'error') { onError(new Error(event.error)); es.close(); }
  };

  es.onerror = () => { onError(new Error('Stream disconnected')); es.close(); };

  return () => es.close();
}
