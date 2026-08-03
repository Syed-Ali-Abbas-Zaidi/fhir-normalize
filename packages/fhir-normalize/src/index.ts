/**
 * The canonical output types, re-exported so consumers can name what they get
 * back without taking their own direct dependency on `@types/fhir`.
 */
export type { Bundle, BundleEntry, FhirResource } from 'fhir/r4';

import { Normalizer } from './core';
import { fhirJsonParser } from './parsers/fhir-json';
import { fhirXmlParser } from './parsers/fhir-xml';
import { r4VersionTransform } from './version';

export type {
  BundleType,
  CreateParseResultInput,
  FormatParser,
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
export { fhirJsonParser } from './parsers/fhir-json';
export { fhirXmlParser } from './parsers/fhir-xml';
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
 * A `Normalizer` with every built-in parser registered — the batteries-included
 * entry point.
 *
 * It is a factory rather than a shared singleton so importing this module has
 * no side effects: each caller gets an isolated registry it can extend with
 * `register()` without affecting anyone else.
 *
 * Registration order is detection order. JSON goes first because its check is
 * the stricter of the two: it requires a decodable object with a
 * `resourceType`, while the XML check only looks for a leading `<`.
 *
 * Cross-version normalization runs as a post-parse stage, so STU3 and R5 input
 * lands on R4 whichever serialization it arrived in. Drop it with
 * `new Normalizer().register(...)` if you want the source release preserved.
 */
export const createDefaultNormalizer = (): Normalizer =>
  new Normalizer().register(fhirJsonParser).register(fhirXmlParser).use(r4VersionTransform);
