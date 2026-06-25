import useStore from '../store/useStore.js';
import { SpotifyIcon, YouTubeIcon } from './Icons.jsx';
import styles from './DestSection.module.css';

const OPTIONS = [
  { key: 'exactMatchOnly', label: 'Exact match only', desc: 'Skip fuzzy title/artist matches' },
  { key: 'preserveOrder', label: 'Preserve order',    desc: 'Keep original track sequence' },
  { key: 'skipDuplicates', label: 'Skip duplicates',  desc: "Don't add if already in dest" },
  { key: 'makePublic',    label: 'Make public',        desc: 'New playlist visible to anyone' },
];

export default function DestSection() {
  const { dest, setDest, options, toggleOption, auth } = useStore();

  return (
    <div className={styles.section}>
      <div className={styles.label}>Transfer to</div>

      <div className={styles.destRow}>
        <DestOption
          id="spotify"
          active={dest === 'spotify'}
          onClick={() => setDest('spotify')}
          icon={<SpotifyIcon size={22} />}
          name="Spotify"
          status={auth.spotify ? '● connected' : 'connect to use'}
        />
        <DestOption
          id="youtube"
          active={dest === 'youtube'}
          onClick={() => setDest('youtube')}
          icon={<YouTubeIcon size={22} />}
          name="YouTube Music"
          status={auth.youtube ? '● connected' : 'connect to use'}
        />
      </div>

      <div className={styles.optGrid}>
        {OPTIONS.map(({ key, label, desc }) => (
          <button
            key={key}
            className={`${styles.optTog} ${options[key] ? styles.on : ''}`}
            onClick={() => toggleOption(key)}
          >
            <div className={styles.optLabel}>{label}</div>
            <div className={styles.optDesc}>{desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DestOption({ active, onClick, icon, name, status }) {
  return (
    <div className={`${styles.dopt} ${active ? styles.sel : ''}`} onClick={onClick}>
      {icon}
      <div>
        <div className={styles.dn}>{name}</div>
        <div className={styles.ds}>{status}</div>
      </div>
      <div className={styles.radio} />
    </div>
  );
}
