import type { DESCRIBE_FORMAT, FIELD_KIND, VALUE_KIND } from './constants';
import type { ResourceFieldMap } from './fields.generated';

export type ValueKind = (typeof VALUE_KIND)[keyof typeof VALUE_KIND];
export type FieldKind = (typeof FIELD_KIND)[keyof typeof FIELD_KIND];
export type DescribeFormat = (typeof DESCRIBE_FORMAT)[keyof typeof DESCRIBE_FORMAT];

/** One entry from a CodeableConcept's `coding` array. */
export interface NormalizedCoding {
  system: string | null;
  code: string | null;
  display: string | null;
}

/**
 * Every normalized value carries `kind` and `text`.
 *
 * `kind` is the discriminant, so a consumer can switch on it exhaustively.
 * `text` is always a human-readable rendering, so a consumer that only wants
 * to display something never has to switch at all.
 */
interface NormalizedBase {
  kind: ValueKind;
  text: string;
}

/** A CodeableConcept or a bare Coding, flattened to its primary code. */
export interface NormalizedConcept extends NormalizedBase {
  kind: typeof VALUE_KIND.CONCEPT;
  code: string | null;
  system: string | null;
  display: string | null;
  /** Every coding, for callers that need more than the primary one. */
  codings: NormalizedCoding[];
}

export interface NormalizedQuantity extends NormalizedBase {
  kind: typeof VALUE_KIND.QUANTITY;
  value: number | null;
  unit: string | null;
  system: string | null;
  code: string | null;
  comparator: string | null;
}

export interface NormalizedReference extends NormalizedBase {
  kind: typeof VALUE_KIND.REFERENCE;
  reference: string | null;
  /** Parsed out of `Patient/pat-1`, so callers do not split strings themselves. */
  resourceType: string | null;
  id: string | null;
  display: string | null;
}

export interface NormalizedPeriod extends NormalizedBase {
  kind: typeof VALUE_KIND.PERIOD;
  start: string | null;
  end: string | null;
}

export interface NormalizedRange extends NormalizedBase {
  kind: typeof VALUE_KIND.RANGE;
  low: NormalizedQuantity | null;
  high: NormalizedQuantity | null;
}

export interface NormalizedRatio extends NormalizedBase {
  kind: typeof VALUE_KIND.RATIO;
  numerator: NormalizedQuantity | null;
  denominator: NormalizedQuantity | null;
}

export interface NormalizedName extends NormalizedBase {
  kind: typeof VALUE_KIND.NAME;
  use: string | null;
  prefix: string[];
  given: string[];
  family: string | null;
  suffix: string[];
}

export interface NormalizedContactPoint extends NormalizedBase {
  kind: typeof VALUE_KIND.CONTACT;
  system: string | null;
  value: string | null;
  use: string | null;
}

export interface NormalizedAddress extends NormalizedBase {
  kind: typeof VALUE_KIND.ADDRESS;
  line: string[];
  city: string | null;
  district: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  use: string | null;
}

export interface NormalizedIdentifier extends NormalizedBase {
  kind: typeof VALUE_KIND.IDENTIFIER;
  system: string | null;
  value: string | null;
  use: string | null;
}

export interface NormalizedString extends NormalizedBase {
  kind: typeof VALUE_KIND.STRING;
  value: string;
}

export interface NormalizedBoolean extends NormalizedBase {
  kind: typeof VALUE_KIND.BOOLEAN;
  value: boolean;
}

export interface NormalizedNumber extends NormalizedBase {
  kind: typeof VALUE_KIND.NUMBER;
  value: number;
}

export interface NormalizedDateTime extends NormalizedBase {
  kind: typeof VALUE_KIND.DATE_TIME;
  value: string;
}

/** A datatype the module has no dedicated shape for. Kept, never dropped. */
export interface NormalizedUnknown extends NormalizedBase {
  kind: typeof VALUE_KIND.UNKNOWN;
  value: unknown;
}

export type NormalizedValue =
  | NormalizedConcept
  | NormalizedQuantity
  | NormalizedReference
  | NormalizedPeriod
  | NormalizedRange
  | NormalizedRatio
  | NormalizedName
  | NormalizedContactPoint
  | NormalizedAddress
  | NormalizedIdentifier
  | NormalizedString
  | NormalizedBoolean
  | NormalizedNumber
  | NormalizedDateTime
  | NormalizedUnknown;

/** How a declared field is normalized, and whether it repeats. */
export interface FieldSpec {
  kind: FieldKind;
  /** `true` when the FHIR element is `0..*`, so the output is always an array. */
  list?: boolean;
  /** Nested specs for a `GROUP` — a backbone element such as `Observation.component`. */
  fields?: Readonly<Record<string, FieldSpec>>;
  /**
   * For a `CHOICE`, the FHIR type names R4 allows — `['Quantity', 'string', …]`.
   *
   * A choice is resolved from the type suffix on the element name, so without
   * this any suffix is accepted: R5 `Observation.valueReference` would land on
   * `value` even though R4 permits no Reference there, and be presented as
   * conformant. When present, a suffix outside this list is left for
   * `unmapped` instead. Absent means "accept any known type", which is what a
   * resource with no declared shape gets.
   */
  types?: readonly string[];
}

export interface ResourceShape {
  /** Field specs, keyed by FHIR element name. Output preserves this order. */
  fields: Readonly<Record<string, FieldSpec>>;
  /** Builds the one-line label for the resource. */
  display?: (fields: SimplifiedFields) => string | null;
}

/** A normalized field map. Groups nest, so a backbone element keeps its structure. */
export type SimplifiedFields = {
  [key: string]: NormalizedValue | NormalizedValue[] | SimplifiedFields[];
};

/** One field of a resource's simplified structure, described rather than filled. */
export interface ShapeFieldDescription {
  name: string;
  kind: FieldKind;
  /** `true` when the output is always an array. */
  list: boolean;
  /** Value kinds this field can hold. A `CHOICE` lists all of them. */
  valueKinds: ValueKind[];
  /** Property names on the normalized value, empty for groups and choices. */
  properties: string[];
  /** Nested fields, for a group. */
  fields: ShapeFieldDescription[];
}

/** The simplified structure of a resource type, without needing a payload. */
export interface ShapeDescription {
  resourceType: string;
  /** The type whose shape this reuses, or `null` when it has its own. */
  aliasOf: string | null;
  fields: ShapeFieldDescription[];
}

/** One resource, reduced to a predictable shape. */
/**
 * The fields of a known resource type, or the loose map for anything else.
 *
 * `simplifyResource` picks this up from the input's `resourceType` when the
 * caller passes a typed resource, so `fields.value` on an Observation is the
 * nine-member union R4 permits rather than "some normalized value".
 */
export type FieldsOf<T extends string> = T extends keyof ResourceFieldMap
  ? ResourceFieldMap[T]
  : SimplifiedFields;

export interface SimplifiedResourceOf<T extends string = string> {
  resourceType: T;
  id: string | null;
  /** A one-line human label. Always a string, never empty. */
  display: string;
  /**
   * Normalized fields, keyed by their canonical name with any choice-type
   * suffix removed — `valueQuantity` and `valueString` both land on `value`.
   */
  fields: FieldsOf<T>;
  /**
   * Elements present on the resource that the shape does not declare. Listed
   * rather than silently dropped, so a gap in coverage is visible.
   */
  unmapped: string[];
}

/** A simplified resource whose type is not known at compile time. */
export type SimplifiedResource = SimplifiedResourceOf<string>;
