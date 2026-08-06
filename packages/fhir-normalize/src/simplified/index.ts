export { normalizeByKind, resolveChoice } from './choice';
export { DESCRIBE_FORMAT, FIELD_KIND, TYPE_SUFFIX_KIND, VALUE_KIND } from './constants';
export { describeShape, formatShape, listShapes, valueProperties } from './describe';
/**
 * Per-resource field types, generated from the shape tables — `PatientFields`,
 * `ObservationFields`, and so on, plus the `ResourceFieldMap` that keys them by
 * `resourceType`. `simplifyResource` picks the right one from its input, so
 * these are only needed when naming the type yourself.
 */
export type * from './fields.generated';
export {
  BASE_SHAPE,
  CLINICAL_ALIAS,
  CLINICAL_SHAPE,
  COMMON_ELEMENT,
  FINANCIAL_SHAPE,
  FOUNDATION_SHAPE,
  RESOURCE_SHAPE,
  SPECIALIZED_SHAPE,
  shapeFor,
} from './shapes';
export type {
  DescribeFormat,
  FieldKind,
  FieldSpec,
  FieldsOf,
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
  SimplifiedResourceOf,
  ValueKind,
} from './types';
export { simplifyBundle, simplifyResource } from './utils';
