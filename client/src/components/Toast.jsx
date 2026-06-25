import useStore from '../store/useStore.js';
import styles from './Toast.module.css';

export default function Toast() {
  const { toast } = useStore();
  return (
    <div className={`${styles.toast} ${toast.visible ? styles.show : ''}`}>
      <div className={styles.dot} />
      <span>{toast.message}</span>
    </div>
  );
}
