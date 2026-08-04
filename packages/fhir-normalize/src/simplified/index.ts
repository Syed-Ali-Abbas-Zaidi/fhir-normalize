export { normalizeByKind, resolveChoice } from './choice';
export { DESCRIBE_FORMAT, FIELD_KIND, VALUE_KIND } from './constants';
export { describeShape, formatShape, listShapes, valueProperties } from './describe';
export {
  BASE_SHAPE,
  CLINICAL_ALIAS,
  CLINICAL_SHAPE,
  COMMON_ELEMENT,
  FINANCIAL_SHAPE,
  FOUNDATION_SHAPE,
  RESOURCE_SHAPE,
  shapeFor,
} from './shapes';
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
} from './types';
export { simplifyBundle, simplifyResource } from './utils';
