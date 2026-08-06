import { createWarningLog, type ParseResult, type ResultTransform } from '../core';
import { DEID_TRANSFORM_NAME, DEID_WARNING, FREE_TEXT_POLICY } from './constants';
import type { DeIdentifyOptions } from './types';
import { deIdentifyBundle } from './utils';

export {
  DATE_POLICY,
  DEID_ACTION,
  DEID_TRANSFORM_NAME,
  DEID_WARNING,
  FREE_TEXT_ELEMENT,
  FREE_TEXT_POLICY,
  REDACT_ELEMENT,
} from './constants';
export { surrogate, surrogateReference } from './surrogate';
export type {
  DatePolicy,
  DeIdentifyAction,
  DeIdentifyOptions,
  DeIdentifyReport,
  DeIdentifyResourceResult,
  DeIdentifyResult,
  FreeTextPolicy,
} from './types';
export { deIdentifyBundle, deIdentifyResource } from './utils';

/**
 * A post-parse stage that strips direct identifiers.
 *
 * Runs after cross-version normalization so it operates on canonical R4, and
 * reports what it did through `meta.warnings` — including the two caveats that
 * matter: this is a structural pass, not a certified anonymisation, and free
 * text is the part no structural rule can police.
 */
export const createDeIdentifyTransform = (options: DeIdentifyOptions = {}): ResultTransform => ({
  name: DEID_TRANSFORM_NAME,

  transform(result: ParseResult): ParseResult {
    const { bundle, report } = deIdentifyBundle(result.bundle, options);
    const warnings = createWarningLog();

    warnings.add(DEID_WARNING.SUMMARY(report));
    if (options.freeText === FREE_TEXT_POLICY.KEEP) warnings.add(DEID_WARNING.FREE_TEXT_KEPT);
    warnings.add(DEID_WARNING.NOT_CERTIFIED);

    return {
      bundle,
      meta: { ...result.meta, warnings: [...result.meta.warnings, ...warnings.list()] },
    };
  },
});
