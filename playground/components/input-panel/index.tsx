'use client';

import { DEIDENTIFY_LABEL, MODE_OPTIONS, SAMPLES, VISUALLY_HIDDEN } from '@/constants';
import styles from './input-panel.module.css';
import type { InputPanelProps } from './types';

const EDITOR_ID = 'playground-input';

export const InputPanel = ({
  input,
  onInputChange,
  mode,
  onModeChange,
  deIdentify,
  onDeIdentifyChange,
}: InputPanelProps) => (
  <section className={styles.panel}>
    <div className={styles.header}>
      <label className={styles.eyebrow} htmlFor={EDITOR_ID}>
        input · raw
      </label>
      <fieldset className={styles.modes}>
        <legend className={VISUALLY_HIDDEN}>Input format</legend>
        {MODE_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={styles.mode}
            aria-pressed={mode === value}
            onClick={() => onModeChange(value)}
          >
            {label}
          </button>
        ))}
      </fieldset>
    </div>

    <div className={styles.toggleRow}>
      <button
        type="button"
        className={styles.mode}
        aria-pressed={deIdentify}
        onClick={() => onDeIdentifyChange(!deIdentify)}
        title="Strip names, contact details, narrative, and free text; reduce dates to a year"
      >
        {DEIDENTIFY_LABEL}
      </button>
    </div>

    <textarea
      id={EDITOR_ID}
      className={styles.editor}
      value={input}
      onChange={(event) => onInputChange(event.target.value)}
      spellCheck={false}
      placeholder="Paste a FHIR resource, Bundle, or XML document…"
    />

    <div className={styles.footer}>
      <span className={styles.footerLabel}>load:</span>
      {SAMPLES.map(({ label, payload, hint }) => (
        <button
          key={label}
          type="button"
          className={styles.sample}
          title={hint}
          onClick={() => onInputChange(payload)}
        >
          {label}
        </button>
      ))}
      <button type="button" className={styles.clear} onClick={() => onInputChange('')}>
        clear
      </button>
    </div>
  </section>
);
