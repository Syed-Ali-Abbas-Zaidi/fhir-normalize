import type { ResourceSummary } from '@/types';
import styles from './views.module.css';

const SummaryCard = ({ summary }: { summary: ResourceSummary }) => (
  <article className={styles.card}>
    <header className={styles.cardHeader}>
      <span className={styles.dot} aria-hidden />
      <h3 className={styles.cardTitle}>{summary.type}</h3>
    </header>
    <div className={styles.cardBody}>
      {summary.fields.length === 0 ? (
        <p className={styles.rowValue}>Nothing summarizable on this resource.</p>
      ) : (
        summary.fields.map(({ label, value }) => (
          <div key={label} className={styles.row}>
            <span className={styles.rowLabel}>{label}</span>
            <span className={styles.rowValue}>{value}</span>
          </div>
        ))
      )}
    </div>
  </article>
);

/** A preview of the simplified-view layer, read off the canonical bundle. */
export const ExtractedView = ({ summaries }: { summaries: readonly ResourceSummary[] }) => (
  <div className={styles.cards}>
    {summaries.map((summary) => (
      <SummaryCard key={summary.key} summary={summary} />
    ))}
  </div>
);
