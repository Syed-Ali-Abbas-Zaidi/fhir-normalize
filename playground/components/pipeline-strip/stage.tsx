import { Activity } from 'lucide-react';
import styles from './pipeline-strip.module.css';
import type { StageProps } from './types';

export const Stage = ({
  label,
  badge,
  active = false,
  terminal = false,
  icon = false,
}: StageProps) => (
  <li className={styles.stage}>
    {icon && <Activity size={13} className={styles.icon} data-active={active} aria-hidden />}
    <span className={styles.label} data-active={active} data-terminal={terminal}>
      {label}
    </span>
    {badge !== undefined && (
      <span className={styles.badge} data-empty={badge.empty}>
        {badge.text}
      </span>
    )}
  </li>
);
