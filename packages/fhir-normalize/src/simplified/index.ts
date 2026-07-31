export { normalizeByKind, resolveChoice } from './choice';
export { FIELD_KIND, VALUE_KIND } from './constants';
export { COMMON_ELEMENT, RESOURCE_SHAPE } from './shapes';
export type {
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
  SimplifiedFields,
  SimplifiedResource,
  ValueKind,
} from './types';
export { simplifyBundle, simplifyResource } from './utils';
