import Topbar from './components/Topbar.jsx';
import SourceSection from './components/SourceSection.jsx';
import TrackList from './components/TrackList.jsx';
import DestSection from './components/DestSection.jsx';
import RecipientSection from './components/RecipientSection.jsx';
import TransferSection from './components/TransferSection.jsx';
import RecentTransfers from './components/RecentTransfers.jsx';
import Toast from './components/Toast.jsx';
import styles from './App.module.css';

export default function App() {
  return (
    <div className={styles.wrap}>
      <Topbar />

      <main className={styles.hero}>
        <p className={styles.eyebrow}>cross-platform playlist transfer</p>
        <h1 className={styles.h1}>Your music, on <em>any</em> platform</h1>
        <p className={styles.sub}>
          Paste a playlist link. Pick your tracks. Choose a destination.
          We move your music — and can send it to whoever you want.
        </p>

        {/* ── Main card ── */}
        <div className={styles.card}>
          {/* 1 · Source URL + playlist preview */}
          <SourceSection />

          {/* 2 · Track list (visible only after playlist loaded) */}
          <TrackList />

          <hr className={styles.divider} />

          {/* 3 · Destination picker + transfer options */}
          <DestSection />

          <hr className={styles.divider} />

          {/* 4 · Optional recipient */}
          <RecipientSection />

          {/* 5 · Animated rail + progress + CTA */}
          <TransferSection />
        </div>

        {/* Recent transfers history */}
        <RecentTransfers />
      </main>

      <Toast />
    </div>
  );
}
