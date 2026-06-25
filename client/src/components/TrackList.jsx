import { useMemo } from 'react';
import useStore from '../store/useStore.js';
import { MusicNoteIcon } from './Icons.jsx';
import styles from './TrackList.module.css';

const COLORS = ['#2d4a3a','#4a2d3e','#2d3a4a','#4a3d2d','#3d4a2d','#4a2d2d','#2d2d4a','#3a2d4a'];

function fmtMs(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function MatchPill({ status }) {
  if (status === 'found') return <span className={`${styles.pill} ${styles.found}`}>matched</span>;
  if (status === 'fuzzy') return <span className={`${styles.pill} ${styles.fuzzy}`}>fuzzy</span>;
  if (status === 'miss') return <span className={`${styles.pill} ${styles.miss}`}>not found</span>;
  return null;
}

export default function TrackList() {
  const { playlist, selectedIds, toggleTrack, selectAll, deselectAll, filterQuery, setFilterQuery } = useStore();

  const filtered = useMemo(() => {
    if (!playlist) return [];
    const q = filterQuery.toLowerCase();
    if (!q) return playlist.tracks;
    return playlist.tracks.filter(
      (t) => t.name.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
    );
  }, [playlist, filterQuery]);

  const allSelected = playlist && selectedIds.size === playlist.tracks.length;

  // Stats
  const selTracks = useMemo(() => {
    if (!playlist) return [];
    return playlist.tracks.filter((t) => selectedIds.has(t.id));
  }, [playlist, selectedIds]);

  const stats = useMemo(() => ({
    matched: selTracks.filter((t) => t.matchStatus === 'found').length,
    fuzzy: selTracks.filter((t) => t.matchStatus === 'fuzzy').length,
    miss: selTracks.filter((t) => t.matchStatus === 'miss').length,
    selected: selTracks.length,
  }), [selTracks]);

  if (!playlist) return null;

  return (
    <div className={styles.wrapper}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <input
          className={styles.search}
          type="text"
          placeholder="filter tracks…"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        <button className={styles.selBtn} onClick={allSelected ? deselectAll : selectAll}>
          {allSelected ? 'deselect all' : 'select all'}
        </button>
        <span className={styles.selLabel}>{selectedIds.size} / {playlist.tracks.length}</span>
      </div>

      {/* Track rows */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>no tracks match</div>
        ) : (
          filtered.map((track, i) => {
            const on = selectedIds.has(track.id);
            return (
              <div
                key={track.id}
                className={`${styles.row} ${on ? '' : styles.excluded}`}
                onClick={() => toggleTrack(track.id)}
              >
                <span className={styles.num}>{String(i + 1).padStart(2, '0')}</span>
                <div className={styles.art} style={{ background: COLORS[i % COLORS.length] }}>
                  <MusicNoteIcon size={11} />
                </div>
                <div className={styles.body}>
                  <div className={styles.name}>{track.name}</div>
                  <div className={styles.artist}>{track.artist}</div>
                </div>
                <MatchPill status={track.matchStatus} />
                <span className={styles.dur}>{fmtMs(track.duration_ms)}</span>
                <div className={`${styles.cb} ${on ? styles.cbOn : ''}`} />
              </div>
            );
          })
        )}
      </div>

      {/* Stats bar */}
      <div className={styles.statsRow}>
        <div className={styles.stat}><span className={`${styles.val} ${styles.green}`}>{stats.matched}</span><span className={styles.lbl}>matched</span></div>
        <div className={styles.stat}><span className={`${styles.val} ${styles.gold}`}>{stats.fuzzy}</span><span className={styles.lbl}>fuzzy</span></div>
        <div className={styles.stat}><span className={`${styles.val} ${styles.red}`}>{stats.miss}</span><span className={styles.lbl}>not found</span></div>
        <div className={styles.stat}><span className={styles.val}>{stats.selected}</span><span className={styles.lbl}>selected</span></div>
      </div>
    </div>
  );
}
