'use client';

import { Check, Copy } from 'lucide-react';
import type { ReactNode } from 'react';
import { OUTPUT_TAB, RESULT_STATE, TAB_OPTIONS } from '@/constants';
import { useCopy } from '@/hooks';
import type { OutputTab } from '@/types';
import { ExtractedView } from './extracted-view';
import { NormalizedView } from './normalized-view';
import styles from './output-panel.module.css';
import { ShapeView } from './shape-view';
import { StandardView } from './standard-view';
import { EmptyView, ErrorView } from './status-views';
import type { OutputPanelProps } from './types';
import { WarningsView } from './warnings-view';

export const OutputPanel = ({
  result,
  summaries,
  normalized,
  shapeText,
  warnings,
  tab,
  onTabChange,
}: OutputPanelProps) => {
  const { copied, copy } = useCopy();
  const parsed = result.state === RESULT_STATE.OK;

  // Exhaustive over the tab union, so adding a tab will not compile until it
  // has content here.
  const tabContent: Record<OutputTab, ReactNode> = {
    [OUTPUT_TAB.STANDARD]: parsed ? <StandardView bundle={result.bundle} /> : null,
    [OUTPUT_TAB.NORMALIZED]: <NormalizedView resources={normalized} />,
    [OUTPUT_TAB.SHAPE]: <ShapeView text={shapeText} />,
    [OUTPUT_TAB.EXTRACTED]: <ExtractedView summaries={summaries} />,
    [OUTPUT_TAB.WARNINGS]: <WarningsView warnings={warnings} />,
  };

  const tabLabel = (value: OutputTab, label: string): string =>
    value === OUTPUT_TAB.WARNINGS && warnings.length > 0 ? `${label} (${warnings.length})` : label;

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerMeta}>
          <span className={styles.eyebrow}>output · standard</span>
          {parsed && (
            <>
              <span className={styles.pill}>{result.meta.sourceFormat}</span>
              <span className={styles.pill}>
                {summaries.length} resource{summaries.length === 1 ? '' : 's'}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          className={styles.copy}
          disabled={!parsed}
          onClick={() => parsed && copy(JSON.stringify(result.bundle, null, 2))}
        >
          {copied ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Output view">
        {TAB_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === value}
            onClick={() => onTabChange(value)}
          >
            {tabLabel(value, label)}
          </button>
        ))}
      </div>

      <div className={styles.body}>
        {result.state === RESULT_STATE.EMPTY && <EmptyView />}
        {result.state === RESULT_STATE.ERROR && (
          <ErrorView name={result.name} message={result.message} />
        )}
        {parsed && (
          <div key={`${tab}-${result.meta.parsedAt}`} className={styles.fade}>
            {tabContent[tab]}
          </div>
        )}
      </div>
    </section>
  );
};
