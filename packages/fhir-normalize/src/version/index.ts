import { createWarningLog, type ParseResult, type ResultTransform } from '../core';
import { VERSION_TRANSFORM_NAME } from './constants';
import { migrateBundleToR4 } from './utils';

export { FHIR_VERSION, VERSION_MIGRATION, VERSION_TRANSFORM_NAME } from './constants';
export type { FhirVersion, FieldMigration, MigrationTable } from './types';

/**
 * Post-parse stage that migrates STU3 and R5 resources onto R4, so the
 * canonical output really is one shape no matter which release the source
 * system speaks.
 *
 * It is marker-driven rather than version-declared: FHIR resources do not
 * carry their own release, so each migration fires on the presence of a field
 * that only exists in the older or newer release. That handles mixed bundles
 * for free, and leaves genuine R4 input completely untouched — no changes, no
 * warnings.
 *
 * Every migration is reported in `meta.warnings`, including what was lost,
 * because several of these differences cannot be bridged without dropping data.
 */
export const r4VersionTransform: ResultTransform = {
  name: VERSION_TRANSFORM_NAME,

  transform(result: ParseResult): ParseResult {
    const warnings = createWarningLog();
    const bundle = migrateBundleToR4(result.bundle, warnings);
    const added = warnings.list();

    if (added.length === 0) return result;

    return {
      bundle,
      meta: { ...result.meta, warnings: [...result.meta.warnings, ...added] },
    };
  },
};
