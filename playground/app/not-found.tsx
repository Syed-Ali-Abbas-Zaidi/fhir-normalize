import { ArrowLeft, Stethoscope } from 'lucide-react';
import Link from 'next/link';
import styles from './not-found.module.css';

/**
 * The 404. A server component with no client JavaScript: it is the one page
 * most likely to be reached by something that cannot run any — a crawler, a
 * stale link, a probe — so it renders as plain HTML and the link is a real
 * anchor rather than a router push.
 *
 * The playground is a single route, so there is nowhere to send anyone except
 * home, and no search or suggestions worth pretending to offer.
 */
const NotFound = () => (
  <main className={styles.page}>
    <div className={styles.card}>
      <div className={styles.mark}>
        <Stethoscope size={18} strokeWidth={2.2} aria-hidden />
      </div>

      <p className={styles.code}>404</p>
      <h1 className={styles.title}>No such page</h1>
      <p className={styles.body}>
        The playground lives at a single address. Whatever was here has moved, or was never here.
      </p>

      <Link href="/" className={styles.action}>
        <ArrowLeft size={15} aria-hidden />
        Back to the playground
      </Link>
    </div>
  </main>
);

export default NotFound;
