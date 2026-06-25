import { useState, useEffect } from 'react';
import { SpotifyIcon, YouTubeIcon } from './Icons.jsx';
import styles from './RecentTransfers.module.css';

const STORAGE_KEY = 'trackbridge_recent';

export function saveRecent(entry) {
  try {
    const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    const updated = [entry, ...prev].slice(0, 10);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const MOCK = [
  { id: 1, name: 'Late Night Drive', from: 'spotify', to: 'ytmusic', trackCount: 32, status: 'done', ts: Date.now() - 7200000 },
  { id: 2, name: 'Gym Bangers',      from: 'ytmusic', to: 'spotify', trackCount: 78, status: 'queued', ts: Date.now() - 86400000 },
];

export default function RecentTransfers() {
  const [items, setItems] = useState(MOCK);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (stored.length) setItems(stored);
    } catch {}
  }, []);

  if (!items.length) return null;

  return (
    <div className={styles.section}>
      <div className={styles.title}>Recent transfers</div>
      <div className={styles.list}>
        {items.map((item) => (
          <div key={item.id} className={styles.item}>
            <div className={styles.thumbGrid}>
              <div className={styles.tc1} /><div className={styles.tc2} />
              <div className={styles.tc3} /><div className={styles.tc4} />
            </div>
            <div className={styles.info}>
              <div className={styles.name}>{item.name}</div>
              <div className={styles.route}>
                {item.from === 'spotify' ? <SpotifyIcon size={12} /> : <YouTubeIcon size={12} />}
                <span className={styles.arrow}>→</span>
                {item.to === 'spotify' ? <SpotifyIcon size={12} /> : <YouTubeIcon size={12} />}
                {item.trackCount} tracks
              </div>
            </div>
            <span className={`${styles.pill} ${item.status === 'done' ? styles.done : styles.pending}`}>
              {item.status}
            </span>
            <span className={styles.date}>{timeAgo(item.ts)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
