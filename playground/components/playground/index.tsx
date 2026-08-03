'use client';

import { Stethoscope } from 'lucide-react';
import { InputPanel } from '@/components/input-panel';
import { OutputPanel } from '@/components/output-panel';
import { PipelineStrip } from '@/components/pipeline-strip';
import { RESULT_STATE } from '@/constants';
import { usePlayground } from '@/hooks';
import { registeredFormats, registeredStages } from '@/utils';
import styles from './playground.module.css';

/**
 * Thin orchestrator: it wires the hook's state to the three panels and renders.
 * All parsing, summarizing, and highlighting lives in `utils/`.
 */
export const Playground = () => {
  const {
    input,
    setInput,
    mode,
    setMode,
    tab,
    setTab,
    detectedFormat,
    result,
    summaries,
    normalized,
    deIdentify,
    setDeIdentify,
    shapeText,
    warnings,
  } = usePlayground();

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <div className={styles.mark}>
            <Stethoscope size={18} strokeWidth={2.2} aria-hidden />
          </div>
          <div>
            <h1 className={styles.wordmark}>fhir-normalize</h1>
            <p className={styles.tagline}>
              Paste any supported format — get one standard shape back.
            </p>
          </div>
        </header>

        <PipelineStrip
          detectedFormat={detectedFormat}
          normalized={result.state === RESULT_STATE.OK}
        />

        <div className={styles.panes}>
          <InputPanel
            input={input}
            onInputChange={setInput}
            mode={mode}
            onModeChange={setMode}
            deIdentify={deIdentify}
            onDeIdentifyChange={setDeIdentify}
          />
          <OutputPanel
            result={result}
            summaries={summaries}
            normalized={normalized}
            shapeText={shapeText}
            warnings={warnings}
            tab={tab}
            onTabChange={setTab}
          />
        </div>

        <p className={styles.colophon}>
          canonical target · FHIR R4 &nbsp;·&nbsp; adapters: {registeredFormats().join(', ')}{' '}
          &nbsp;·&nbsp; stages: {registeredStages().join(', ')}
        </p>
      </div>
    </main>
  );
};
