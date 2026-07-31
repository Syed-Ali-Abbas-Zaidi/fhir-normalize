import { AlertTriangle, Check } from 'lucide-react';
import styles from './views.module.css';

/** Warnings are the point, not an afterthought — this is the "warn, don't throw" rule made visible. */
export const WarningsView = ({ warnings }: { warnings: readonly string[] }) => {
  if (warnings.length === 0) {
    return (
      <p className={styles.clean}>
        <Check size={15} aria-hidden /> Clean parse — no warnings.
      </p>
    );
  }

  return (
    <ul className={styles.notices}>
      {warnings.map((warning) => (
        <li key={warning} className={styles.notice}>
          <AlertTriangle size={14} className={styles.noticeIcon} aria-hidden />
          <span className={styles.noticeText}>{warning}</span>
        </li>
      ))}
    </ul>
  );
};
