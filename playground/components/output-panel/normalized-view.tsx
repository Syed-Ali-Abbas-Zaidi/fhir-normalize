import type { SimplifiedResource } from 'fhir-normalize';
import { JsonView } from './json-view';
import styles from './views.module.css';

/**
 * The simplified view: choice elements collapsed onto one key, datatypes
 * flattened to fixed shapes, every value carrying `kind` and `text`.
 *
 * This is the answer to FHIR's polymorphism — `valueQuantity`,
 * `valueCodeableConcept`, and `valueString` all arrive here as `value`.
 */
export const NormalizedView = ({ resources }: { resources: readonly SimplifiedResource[] }) => {
  if (resources.length === 0) {
    return <p className={styles.clean}>Nothing to normalize in this bundle.</p>;
  }

  return <JsonView value={resources} />;
};
