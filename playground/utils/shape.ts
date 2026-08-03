import { formatShape } from 'fhir-normalize';

/**
 * The simplified structure for the first resource type in a bundle.
 *
 * Shows what a consumer would model against, which is the question the
 * Normalized tab raises and cannot answer on its own — that tab shows one
 * payload's values, this shows the shape every payload of that type produces.
 */
export const describeResourceShape = (resourceTypes: readonly string[]): string | null => {
  const [first] = resourceTypes;
  return first === undefined ? null : formatShape(first);
};
