import { Normalizer } from './core';
import { fhirJsonParser } from './parsers/fhir-json';

export type {
  BundleType,
  CreateParseResultInput,
  FormatParser,
  ParseMeta,
  ParseResult,
  SourceFormat,
  WarningLog,
} from './core';
// Everything below `Normalizer` is the toolkit for writing a custom adapter:
// build a Bundle, collect warnings, and emit a well-formed ParseResult.
export {
  BUNDLE_TYPE,
  createCollectionBundle,
  createParseResult,
  createWarningLog,
  DEFAULT_BUNDLE_TYPE,
  ERROR_NAME,
  FhirNormalizeError,
  isBundle,
  isBundleType,
  Normalizer,
  ParseError,
  RESOURCE_TYPE,
  SOURCE_FORMAT,
  UnsupportedFormatError,
} from './core';
export { fhirJsonParser } from './parsers/fhir-json';

/**
 * A `Normalizer` with every built-in parser registered — the batteries-included
 * entry point.
 *
 * It is a factory rather than a shared singleton so importing this module has
 * no side effects: each caller gets an isolated registry it can extend with
 * `register()` without affecting anyone else.
 */
export const createDefaultNormalizer = (): Normalizer => new Normalizer().register(fhirJsonParser);
