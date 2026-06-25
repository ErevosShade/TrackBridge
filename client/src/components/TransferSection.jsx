import { useEffect, useRef } from 'react';
import useStore from '../store/useStore.js';
import { api, openTransferStream } from '../utils/api.js';
import { SpotifyIcon, YouTubeIcon, ArrowsIcon, CheckIcon, SpinnerIcon, CopyIcon } from './Icons.jsx';
import styles from './TransferSection.module.css';

const TILE_COLORS = ['#2d4a3a','#4a2d3e','#2d3a4a','#4a3d2d','#3d4a2d','#4a2d2d','#2d2d4a','#3a2d4a'];

export default function TransferSection() {
  const {
    playlist, selectedIds, dest, options, recipientEmail,
    transfer, setTransfer, resetTransfer, showToast,
  } = useStore();

  const cleanupRef = useRef(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  const selectedCount = selectedIds.size;
  const isRunning = transfer.status === 'running';
  const isDone = transfer.status === 'done';

  async function startTransfer() {
    if (!playlist || selectedCount === 0) {
      showToast('Load a playlist and select tracks first');
      return;
    }

    const selectedTracks = playlist.tracks.filter((t) => selectedIds.has(t.id));

    resetTransfer();
    setTransfer({ status: 'running', total: selectedTracks.length });

    try {
      const { jobId } = await api.startTransfer({
        from: playlist.sourcePlatform,
        to: dest,
        tracks: selectedTracks,
        playlistName: playlist.name,
        options,
        recipientEmail: recipientEmail || undefined,
      });

      cleanupRef.current = openTransferStream(jobId, {
        onEvent(event) {
          if (event.type === 'track_done' || event.type === 'track_miss') {
            setTransfer({
              done: event.done,
              total: event.total,
              progress: Math.round((event.done / event.total) * 100),
              currentTrack: event.trackName,
              matched: event.type === 'track_done'
                ? (transfer.matched || 0) + 1
                : (transfer.matched || 0),
            });
          }
        },
        onComplete(event) {
          setTransfer({
            status: 'done',
            progress: 100,
            matched: event.matched,
            missed: event.missed,
            shareToken: event.shareToken,
            destPlaylistId: event.destPlaylistId,
          });
          showToast(`${event.matched} tracks transferred!`);
        },
        onError(err) {
          setTransfer({ status: 'error' });
          showToast(err.message || 'Transfer failed');
        },
      });
    } catch (err) {
      setTransfer({ status: 'error' });
      showToast(err.message || 'Failed to start transfer');
    }
  }

  function copyShareLink() {
    const url = transfer.shareToken
      ? `${window.location.origin}/claim/${transfer.shareToken}`
      : window.location.href;
    navigator.clipboard.writeText(url)
      .then(() => showToast('Share link copied!'))
      .catch(() => showToast('Could not copy'));
  }

  const btnLabel = isRunning
    ? 'Transferring…'
    : isDone
    ? 'Transfer complete ✓'
    : selectedCount > 0
    ? `Transfer (${selectedCount})`
    : 'Start Transfer';

  return (
    <>
      {/* Rail */}
      <div className={styles.railSection}>
        <div className={styles.railLabel}>Transfer rail</div>

        <div className={`${styles.rail} ${isRunning ? styles.active : styles.idle}`}>
          <div className={`${styles.rend} ${styles.rfrom}`}>
            <SpotifyIcon size={20} />
            <span className={styles.rpn}>source</span>
          </div>

          <div className={styles.rtrack}>
            <div className={styles.ritems}>
              {/* Double the tiles so the infinite scroll loops seamlessly */}
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className={styles.rtile}
                  style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              ))}
            </div>

            {!isRunning && transfer.status === 'idle' && (
              <div className={styles.idleMsg}>waiting for playlist</div>
            )}
          </div>

          <div className={`${styles.rend} ${styles.rto}`}>
            <YouTubeIcon size={20} />
            <span className={styles.rpn}>dest</span>
          </div>
        </div>

        {/* Progress */}
        {transfer.status !== 'idle' && (
          <div className={styles.progWrap}>
            <div className={styles.progBg}>
              <div className={styles.progFill} style={{ width: `${transfer.progress}%` }} />
            </div>
            <div className={styles.progMeta}>
              <span className={styles.progTrack}>
                {isDone
                  ? `✓ ${transfer.matched} of ${transfer.total} tracks transferred`
                  : transfer.currentTrack
                  ? `Adding: ${transfer.currentTrack}…`
                  : 'Matching tracks…'}
              </span>
              <span>{transfer.progress}%</span>
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className={styles.ctaSection}>
        <button
          className={`${styles.tbtn} ${isRunning ? styles.running : ''}`}
          onClick={startTransfer}
          disabled={isRunning}
        >
          {isRunning ? <SpinnerIcon size={16} /> : isDone ? <CheckIcon size={16} /> : <ArrowsIcon size={16} />}
          {btnLabel}
        </button>

        <button className={styles.copyBtn} onClick={copyShareLink}>
          <CopyIcon size={14} />
          Share
        </button>
      </div>
    </>
  );
}
