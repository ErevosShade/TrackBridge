import { useEffect, useRef } from 'react';
import useStore from '../store/useStore.js';
import { api, openTransferStream, openScanStream } from '../utils/api.js';
import { SpotifyIcon, YouTubeIcon, ArrowsIcon, CheckIcon, SpinnerIcon, CopyIcon } from './Icons.jsx';
import styles from './TransferSection.module.css';

const TILE_COLORS = ['#2d4a3a','#4a2d3e','#2d3a4a','#4a3d2d','#3d4a2d','#4a2d2d','#2d2d4a','#3a2d4a'];

export default function TransferSection() {
  const {
    playlist, selectedIds, dest, options, recipientEmail,
    transfer, setTransfer, resetTransfer, showToast,
    scan, setScan, setTrackMatchStatus,
  } = useStore();

  const cleanupRef = useRef(null);
  const scanCleanupRef = useRef(null);

  useEffect(() => () => {
    cleanupRef.current?.();
    scanCleanupRef.current?.();
  }, []);

  const selectedCount = selectedIds.size;
  const isRunning = transfer.status === 'running';
  const isDone = transfer.status === 'done';
  const isScanning = scan.status === 'running';
  const isScanned = scan.status === 'done';

  async function startScan() {
    if (!playlist || selectedCount === 0) {
      showToast('Load a playlist and select tracks first');
      return;
    }

    const selectedTracks = playlist.tracks.filter((t) => selectedIds.has(t.id));

    setScan({ status: 'running', progress: 0, done: 0, total: selectedTracks.length, currentTrack: '' });
    // Clear any previous match results so the dashboard reflects this scan only
    selectedTracks.forEach((t) => setTrackMatchStatus(t.id, undefined));

    try {
      const { jobId } = await api.scanTracks({
        from: playlist.sourcePlatform,
        to: dest,
        tracks: selectedTracks,
        options,
      });

      scanCleanupRef.current = openScanStream(jobId, {
        onEvent(event) {
          if (event.type === 'track_scanned') {
            setTrackMatchStatus(event.trackId, event.matchStatus);
            setScan({
              done: event.done,
              total: event.total,
              progress: Math.round((event.done / event.total) * 100),
              currentTrack: event.trackName,
            });
          }
          if (event.type === 'quota_stop') {
            showToast(event.message);
          }
        },
        onComplete(event) {
          setScan({ status: 'done', progress: 100 });
          showToast(`Scan complete — ${event.matched} matched, ${event.fuzzy} fuzzy, ${event.missed} not found`);
        },
        onError(err) {
          setScan({ status: 'error' });
          showToast(err.message || 'Scan failed');
        },
      });
    } catch (err) {
      setScan({ status: 'error' });
      showToast(err.message || 'Failed to start scan');
    }
  }

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

        {/* Scan progress */}
        {scan.status !== 'idle' && (
          <div className={styles.progWrap}>
            <div className={styles.progBg}>
              <div className={styles.progFill} style={{ width: `${scan.progress}%` }} />
            </div>
            <div className={styles.progMeta}>
              <span className={styles.progTrack}>
                {isScanned
                  ? `✓ Scan complete — ${scan.done} of ${scan.total} checked`
                  : scan.currentTrack
                  ? `Checking: ${scan.currentTrack}…`
                  : 'Starting scan…'}
              </span>
              <span>{scan.progress}%</span>
            </div>
          </div>
        )}

        {/* Transfer progress */}
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
          className={`${styles.tbtn} ${isScanning ? styles.running : ''}`}
          onClick={startScan}
          disabled={isScanning || isRunning || selectedCount === 0}
        >
          {isScanning ? <SpinnerIcon size={16} /> : isScanned ? <CheckIcon size={16} /> : <ArrowsIcon size={16} />}
          {isScanning
            ? 'Scanning…'
            : isScanned
            ? 'Scan complete ✓ — rescan'
            : `Scan (${selectedCount})`}
        </button>

        <button
          className={`${styles.tbtn} ${isRunning ? styles.running : ''}`}
          onClick={startTransfer}
          disabled={isRunning || !isScanned}
          title={!isScanned ? 'Run a scan first to preview matches' : undefined}
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