import { NO_SHAPE_TEXT } from '@/constants';
import styles from './views.module.css';

/**
 * The simplified structure of the parsed resource type.
 *
 * The Normalized tab shows what *this* payload became; this shows what every
 * payload of that type will produce, which is what you model against.
 */
export const ShapeView = ({ text }: { text: string | null }) => {
  if (text === null) return <p className={styles.clean}>{NO_SHAPE_TEXT}</p>;

  return <pre className={styles.code}>{text}</pre>;
};
