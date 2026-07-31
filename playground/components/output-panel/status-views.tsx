import { Activity, AlertTriangle } from 'lucide-react';
import styles from './views.module.css';

export const EmptyView = () => (
  <div className={styles.empty}>
    <div className={styles.emptyIcon}>
      <Activity size={20} aria-hidden />
    </div>
    <p className={styles.emptyTitle}>Nothing to normalize yet</p>
    <p className={styles.emptyBody}>
      Paste a FHIR resource on the left, or load a sample to watch it become the standard shape.
    </p>
  </div>
);

interface ErrorViewProps {
  name: string;
  message: string;
}

export const ErrorView = ({ name, message }: ErrorViewProps) => (
  <div className={styles.error}>
    <div className={styles.errorBox} role="alert">
      <AlertTriangle size={16} className={styles.noticeIcon} aria-hidden />
      <div>
        <p className={styles.errorName}>{name}</p>
        <p className={styles.errorMessage}>{message}</p>
      </div>
    </div>
  </div>
);
