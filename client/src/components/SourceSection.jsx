import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import useStore from '../store/useStore.js';
import { api } from '../utils/api.js';
import { SpotifyIcon, YouTubeIcon } from './Icons.jsx';
import styles from './SourceSection.module.css';

function detectPlatform(url) {
  if (/open\.spotify\.com\/playlist/.test(url)) return 'spotify';
  if (/youtube\.com\/playlist|youtu\.be/.test(url)) return 'youtube';
  return null;
}

export default function SourceSection() {
  const [urlVal, setUrlVal] = useState('');
  const { setPlaylist, selectAll, showToast } = useStore();

  const platform = detectPlatform(urlVal);

  const { mutate: detect, isPending } = useMutation({
    mutationFn: () => api.fetchPlaylist(urlVal),
    onSuccess: (data) => {
      setPlaylist(data);
      selectAll();
      showToast(`${data.sourcePlatform === 'spotify' ? 'Spotify' : 'YouTube'} playlist loaded — ${data.trackCount} tracks`);
    },
    onError: (err) => showToast(err.message || 'Failed to load playlist'),
  });

  function handleKey(e) {
    if (e.key === 'Enter') detect();
  }

  const PlatIcon = platform === 'spotify' ? SpotifyIcon : platform === 'youtube' ? YouTubeIcon : null;

  return (
    <div className={styles.section}>
      <div className={styles.label}>Source playlist</div>

      <div className={styles.urlRow}>
        <div className={`${styles.badge} ${platform === 'spotify' ? styles.sp : platform === 'youtube' ? styles.yt : ''}`}>
          {PlatIcon
            ? <PlatIcon size={18} />
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="rgba(255,255,255,0.2)"><path d="M9 18V5l12-2v13M6 21a3 3 0 100-6 3 3 0 000 6zm12-2a3 3 0 100-6 3 3 0 000 6z" /></svg>
          }
        </div>

        <input
          className={styles.urlInput}
          type="text"
          value={urlVal}
          onChange={(e) => setUrlVal(e.target.value)}
          onKeyDown={handleKey}
          placeholder="paste spotify.com/playlist/… or youtube.com/playlist?list=…"
          spellCheck={false}
        />

        <button
          className={styles.detectBtn}
          onClick={() => detect()}
          disabled={!urlVal.trim() || isPending}
        >
          {isPending ? 'Loading…' : 'Detect →'}
        </button>
      </div>

      <PlaylistPreview />
    </div>
  );
}

function PlaylistPreview() {
  const { playlist } = useStore();
  if (!playlist) return null;

  return (
    <div className={styles.preview}>
      <div className={styles.thumbGrid}>
        <div className={styles.tc1} /><div className={styles.tc2} />
        <div className={styles.tc3} /><div className={styles.tc4} />
      </div>
      <div className={styles.meta}>
        <h3>{playlist.name}</h3>
        <p>by {playlist.owner}</p>
      </div>
      <div className={styles.trackCount}>
        <strong>{playlist.trackCount}</strong>
        <span>tracks</span>
      </div>
    </div>
  );
}
