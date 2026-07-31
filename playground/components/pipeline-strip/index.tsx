import { FORMAT_LABEL, NO_FORMAT_BADGE, PIPELINE_STAGE } from '@/constants';
import styles from './pipeline-strip.module.css';
import { Stage } from './stage';
import type { PipelineStripProps } from './types';

/**
 * The signature element: raw input, detected, normalized, standard shape.
 *
 * Marked up as an ordered list because that is what it is — a sequence whose
 * order carries the meaning, not decoration.
 *
 * The detect badge is driven by the library's own `detectFormat`, not a local
 * guess, so the strip shows what the parser will actually do.
 */
export const PipelineStrip = ({ detectedFormat, normalized }: PipelineStripProps) => {
  const detected = detectedFormat !== null;
  const badgeText = detected ? (FORMAT_LABEL[detectedFormat] ?? detectedFormat) : NO_FORMAT_BADGE;

  return (
    <ol className={styles.strip} aria-label="Normalization pipeline">
      <Stage label={PIPELINE_STAGE.RAW} active />
      <Stage
        label={PIPELINE_STAGE.DETECT}
        active={detected}
        badge={{ text: badgeText, empty: !detected }}
      />
      <Stage label={PIPELINE_STAGE.NORMALIZE} active={normalized} icon />
      <Stage label={PIPELINE_STAGE.STANDARD} active={normalized} terminal />
    </ol>
  );
};
