import useStore from '../store/useStore.js';
import { ShareIcon } from './Icons.jsx';
import styles from './RecipientSection.module.css';

export default function RecipientSection() {
  const { recipientEmail, setRecipientEmail, showToast } = useStore();

  function copyLink() {
    const url = `${window.location.origin}/claim/demo-token`;
    navigator.clipboard.writeText(url).then(() => showToast('Share link copied!')).catch(() => showToast('Could not copy link'));
  }

  return (
    <div className={styles.section}>
      <div className={styles.label}>Send to (optional)</div>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="text"
          value={recipientEmail}
          onChange={(e) => setRecipientEmail(e.target.value)}
          placeholder="email or username — they'll get a link to claim the playlist"
        />
        <button className={styles.shareToggle} onClick={copyLink}>
          <ShareIcon size={14} />
          Link
        </button>
      </div>
    </div>
  );
}
