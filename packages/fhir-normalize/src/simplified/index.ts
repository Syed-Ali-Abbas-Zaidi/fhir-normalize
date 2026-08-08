export { normalizeByKind, resolveChoice } from './choice';
export {
  CELL_LIST_SEPARATOR,
  CELL_MODE,
  COLUMN_SEPARATOR,
  COLUMN_SUFFIX,
  DESCRIBE_FORMAT,
  FIELD_KIND,
  IDENTITY_COLUMN,
  LIST_MODE,
  TYPE_SUFFIX_KIND,
  VALUE_KIND,
} from './constants';
export { describeShape, formatShape, listShapes, valueProperties } from './describe';
/**
 * Per-resource field types, generated from the shape tables — `PatientFields`,
 * `ObservationFields`, and so on, plus the `ResourceFieldMap` that keys them by
 * `resourceType`. `simplifyResource` picks the right one from its input, so
 * these are only needed when naming the type yourself.
 */
export type * from './fields.generated';
/**
 * The tabular projection. Kept on this subpath, and out of the root entry
 * point, so it costs nothing to anyone who does not ask for it.
 */
export { columnsOf, toRows, toTables } from './rows';
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
  Cell,
  CellMode,
  DescribeFormat,
  FieldKind,
  FieldSpec,
  FieldsOf,
  ListMode,
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
  Row,
  RowOptions,
  ShapeDescription,
  ShapeFieldDescription,
  SimplifiedFields,
  SimplifiedResource,
  SimplifiedResourceOf,
  ValueKind,
} from './types';
export { simplifyBundle, simplifyResource } from './utils';
