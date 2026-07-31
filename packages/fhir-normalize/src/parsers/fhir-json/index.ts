import {
  createParseResult,
  createWarningLog,
  type FormatParser,
  isNonEmptyString,
  isRecord,
  type ParseResult,
  SOURCE_FORMAT,
} from '../../core';
import { decodeJson, toBundle, tryDecodeJson } from './utils';

/**
 * Adapter for FHIR JSON — a resource, a Bundle, or an array of resources,
 * as either a JSON string or an already-parsed object.
 *
 * Detection is strict (a `resourceType` must be present) so it cannot claim
 * arbitrary JSON. Parsing is lenient: once the caller has committed to this
 * format, gaps become warnings rather than failures.
 */
export const fhirJsonParser: FormatParser = {
  format: SOURCE_FORMAT.FHIR_JSON,

  canParse(raw: unknown): boolean {
    const value = tryDecodeJson(raw);
    return Array.isArray(value) || (isRecord(value) && isNonEmptyString(value.resourceType));
  },

  parse(raw: unknown): ParseResult {
    const warnings = createWarningLog();
    const bundle = toBundle(decodeJson(raw), warnings);

    return createParseResult({
      sourceFormat: SOURCE_FORMAT.FHIR_JSON,
      bundle,
      warnings: warnings.list(),
    });
  },
};
