'use client';

import { MODE_OPTIONS, SAMPLES } from '@/constants';
import styles from './input-panel.module.css';
import type { InputPanelProps } from './types';

const EDITOR_ID = 'playground-input';

export const InputPanel = ({ input, onInputChange, mode, onModeChange }: InputPanelProps) => (
  <section className={styles.panel}>
    <div className={styles.header}>
      <label className={styles.eyebrow} htmlFor={EDITOR_ID}>
        input · raw
      </label>
      <fieldset className={styles.modes}>
        <legend className={styles.legend}>Input format</legend>
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
