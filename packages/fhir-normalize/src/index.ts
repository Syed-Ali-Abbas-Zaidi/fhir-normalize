/**
 * The canonical output types, re-exported so consumers can name what they get
 * back without taking their own direct dependency on `@types/fhir`.
 */
export type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';

import type { NormalizerOptions } from './core';
import { Normalizer } from './core';
import { createDeIdentifyTransform } from './deidentify';
import { fhirJsonParser } from './parsers/fhir-json';
import { ndjsonParser } from './parsers/ndjson';
import { r4VersionTransform } from './version';

export type {
  BundleType,
  CreateParseResultInput,
  FormatParser,
  NormalizerOptions,
  ParseMeta,
  ParseResult,
  ResultTransform,
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
export type {
  DatePolicy,
  DeIdentifyAction,
  DeIdentifyOptions,
  DeIdentifyReport,
  DeIdentifyResourceResult,
  DeIdentifyResult,
  FreeTextPolicy,
} from './deidentify';
export {
  createDeIdentifyTransform,
  DATE_POLICY,
  DEID_ACTION,
  DEID_TRANSFORM_NAME,
  deIdentifyBundle,
  deIdentifyResource,
  FREE_TEXT_ELEMENT,
  FREE_TEXT_POLICY,
  REDACT_ELEMENT,
  surrogate,
  surrogateReference,
} from './deidentify';
export { fhirJsonParser } from './parsers/fhir-json';
export { ndjsonParser } from './parsers/ndjson';
export type {
  DescribeFormat,
  FieldKind,
  FieldSpec,
  NormalizedAddress,
  NormalizedBoolean,
  NormalizedCoding,
  NormalizedConcept,
  NormalizedContactPoint,
  NormalizedDateTime,
  NormalizedIdentifier,
  NormalizedName,
  NormalizedNumber,
  NormalizedPeriod,
  NormalizedQuantity,
  NormalizedRange,
  NormalizedRatio,
  NormalizedReference,
  NormalizedString,
  NormalizedUnknown,
  NormalizedValue,
  ResourceShape,
  ShapeDescription,
  ShapeFieldDescription,
  SimplifiedFields,
  SimplifiedResource,
  ValueKind,
} from './simplified';
export {
  DESCRIBE_FORMAT,
  describeShape,
  FIELD_KIND,
  formatShape,
  listShapes,
  normalizeByKind,
  RESOURCE_SHAPE,
  resolveChoice,
  shapeFor,
  simplifyBundle,
  simplifyResource,
  VALUE_KIND,
  valueProperties,
} from './simplified';
export type { FhirVersion, FieldMigration, MigrationTable } from './version';
export {
  FHIR_VERSION,
  r4VersionTransform,
  VERSION_MIGRATION,
  VERSION_TRANSFORM_NAME,
} from './version';

/**
 * A `Normalizer` with the JSON-family parsers registered — the
 * batteries-included entry point.
 *
 * It is a factory rather than a shared singleton so importing this module has
 * no side effects: each caller gets an isolated registry it can extend with
 * `register()` without affecting anyone else.
 *
 * **XML is not registered here.** Its adapter lives at `fhir-normalize/xml`
 * because `fast-xml-parser` is ~61KB and is not side-effect-free, so importing
 * it from this module linked it into every consumer's bundle whether or not
 * they parsed XML — four times the size of the library itself. Add it back in
 * one line:
 *
 * ```ts
 * import { fhirXmlParser } from 'fhir-normalize/xml';
 *
 * const normalizer = createDefaultNormalizer().register(fhirXmlParser);
 * ```
 *
 * Registration order is detection order. JSON goes first because its check is
 * the strictest: it requires a decodable object with a `resourceType`.
 *
 * Cross-version normalization runs as a post-parse stage, so STU3 and R5 input
 * lands on R4 whichever serialization it arrived in. Drop it with
 * `new Normalizer().register(...)` if you want the source release preserved.
 *
 * Pass `deIdentify` to add the de-identification stage after it, so it always
 * operates on canonical R4. `true` uses the defaults; an options object tunes
 * them. Read the caveats on {@link deIdentifyBundle} before relying on it.
 */
export const createDefaultNormalizer = (options: NormalizerOptions = {}): Normalizer => {
  const normalizer = new Normalizer()
    .register(fhirJsonParser)
    // Last: detection is first-match-wins, and a single JSON resource is
    // legitimately both NDJSON and FHIR JSON. The adapter that already
    // handles it keeps it.
    .register(ndjsonParser)
    .use(r4VersionTransform);

  const { deIdentify } = options;
  if (deIdentify === undefined || deIdentify === false) return normalizer;

  return normalizer.use(createDeIdentifyTransform(deIdentify === true ? {} : deIdentify));
};
