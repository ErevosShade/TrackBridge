import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import useStore from '../store/useStore.js';
import { api } from '../utils/api.js';
import { SpotifyIcon, YouTubeIcon } from './Icons.jsx';
import styles from './Topbar.module.css';

export default function Topbar() {
  const { auth, setAuth, showToast } = useStore();

  const { data } = useQuery({
    queryKey: ['authStatus'],
    queryFn: api.getAuthStatus,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (data) setAuth(data);
  }, [data, setAuth]);

  // Handle OAuth redirect callbacks (?auth_success=spotify etc.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('auth_success');
    const error = params.get('auth_error');
    if (success) {
      showToast(`${success === 'spotify' ? 'Spotify' : 'YouTube Music'} connected`);
      window.history.replaceState({}, '', '/');
    }
    if (error) {
      showToast(`Failed to connect ${error === 'spotify' ? 'Spotify' : 'YouTube'}`);
      window.history.replaceState({}, '', '/');
    }
  }, [showToast]);

  function connectSpotify() {
    if (auth.spotify) {
      api.logoutSpotify().then(() => { setAuth({ ...auth, spotify: false }); showToast('Spotify disconnected'); });
    } else {
      window.location.href = '/auth/spotify';
    }
  }

  function connectYouTube() {
    if (auth.youtube) {
      api.logoutYouTube().then(() => { setAuth({ ...auth, youtube: false }); showToast('YouTube disconnected'); });
    } else {
      window.location.href = '/auth/youtube';
    }
  }

  return (
    <header className={styles.topbar}>
      <div className={styles.logo}>
        <span className={styles.ldot} />
        track<em>bridge</em>
      </div>

      <div className={styles.chips}>
        <button
          className={`${styles.chip} ${auth.spotify ? styles.connected : ''}`}
          onClick={connectSpotify}
          title={auth.spotify ? 'Click to disconnect Spotify' : 'Connect Spotify'}
        >
          <span className={styles.cdot} />
          <SpotifyIcon size={14} />
          {auth.spotify ? 'Spotify ✓' : 'Spotify'}
        </button>

        <button
          className={`${styles.chip} ${auth.youtube ? styles.connected : ''}`}
          onClick={connectYouTube}
          title={auth.youtube ? 'Click to disconnect YouTube' : 'Connect YouTube Music'}
        >
          <span className={styles.cdot} />
          <YouTubeIcon size={14} />
          {auth.youtube ? 'YouTube ✓' : 'YouTube'}
        </button>
      </div>
    </header>
  );
}
