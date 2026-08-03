'use client';

import { NO_SHAPE_TEXT, SHAPE_FORMAT_OPTIONS } from '@/constants';
import type { ShapeFormat } from '@/types';
import { shapeGroups } from '@/utils';
import styles from './views.module.css';

interface ShapeViewProps {
  resourceType: string;
  onResourceTypeChange: (resourceType: string) => void;
  format: ShapeFormat;
  onFormatChange: (format: ShapeFormat) => void;
  text: string | null;
}

const PICKER_ID = 'shape-resource-type';

/**
 * Browse the simplified structure of any resource type the library declares,
 * not only the one that happens to be in the editor.
 *
 * The Normalized tab answers "what did this payload become?"; this answers
 * "what will every payload of this type produce?", which is the question you
 * need settled before writing a model.
 */
export const ShapeView = ({
  resourceType,
  onResourceTypeChange,
  format,
  onFormatChange,
  text,
}: ShapeViewProps) => {
  const groups = shapeGroups();
  const total = groups.reduce((count, group) => count + group.resourceTypes.length, 0);

  return (
    <div className={styles.shape}>
      <div className={styles.shapeBar}>
        <label className={styles.shapeLabel} htmlFor={PICKER_ID}>
          resource
        </label>
        <select
          id={PICKER_ID}
          className={styles.shapeSelect}
          value={resourceType}
          onChange={(event) => onResourceTypeChange(event.target.value)}
        >
          {groups.map((group) => (
            <optgroup key={group.label} label={`${group.label} (${group.resourceTypes.length})`}>
              {group.resourceTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className={styles.shapeFormats}>
          {SHAPE_FORMAT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={styles.shapeFormat}
              aria-pressed={format === option.value}
              onClick={() => onFormatChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className={styles.shapeCount}>{total} shapes</span>
      </div>

      {text === null ? (
        <p className={styles.clean}>{NO_SHAPE_TEXT}</p>
      ) : (
        <pre className={styles.code}>{text}</pre>
      )}
    </div>
  );
};
