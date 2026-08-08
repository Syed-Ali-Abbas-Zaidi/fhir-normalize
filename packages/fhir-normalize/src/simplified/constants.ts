import type { ValueKind } from './types';

/** The discriminant on every normalized value. */
export const VALUE_KIND = {
  CONCEPT: 'concept',
  QUANTITY: 'quantity',
  REFERENCE: 'reference',
  PERIOD: 'period',
  RANGE: 'range',
  RATIO: 'ratio',
  NAME: 'name',
  CONTACT: 'contact',
  ADDRESS: 'address',
  IDENTIFIER: 'identifier',
  STRING: 'string',
  BOOLEAN: 'boolean',
  NUMBER: 'number',
  DATE_TIME: 'dateTime',
  UNKNOWN: 'unknown',
} as const;

/**
 * How a declared field is read. Mostly mirrors {@link VALUE_KIND}, plus
 * `CHOICE`, which resolves a `value[x]`-style element whose type is encoded in
 * the element name rather than known up front.
 */
export const FIELD_KIND = {
  CHOICE: 'choice',
  CONCEPT: 'concept',
  QUANTITY: 'quantity',
  RATIO: 'ratio',
  RANGE: 'range',
  REFERENCE: 'reference',
  PERIOD: 'period',
  NAME: 'name',
  CONTACT: 'contact',
  ADDRESS: 'address',
  IDENTIFIER: 'identifier',
  ANNOTATION: 'annotation',
  PRIMITIVE: 'primitive',
  /** A backbone element with its own nested field specs. */
  GROUP: 'group',
} as const;

/**
 * FHIR type suffixes on choice elements, mapped to the kind they normalize to.
 *
 * This is spec-derived rather than guessed: `value[x]` is serialized as the
 * base name plus the capitalised type name, so `valueQuantity` is a Quantity
 * wherever it appears.
 */
export const TYPE_SUFFIX_KIND: Readonly<Record<string, ValueKind>> = {
  Quantity: VALUE_KIND.QUANTITY,
  Age: VALUE_KIND.QUANTITY,
  Count: VALUE_KIND.QUANTITY,
  Distance: VALUE_KIND.QUANTITY,
  Duration: VALUE_KIND.QUANTITY,
  Money: VALUE_KIND.QUANTITY,
  SimpleQuantity: VALUE_KIND.QUANTITY,
  CodeableConcept: VALUE_KIND.CONCEPT,
  Coding: VALUE_KIND.CONCEPT,
  Reference: VALUE_KIND.REFERENCE,
  Period: VALUE_KIND.PERIOD,
  Range: VALUE_KIND.RANGE,
  Ratio: VALUE_KIND.RATIO,
  HumanName: VALUE_KIND.NAME,
  ContactPoint: VALUE_KIND.CONTACT,
  Address: VALUE_KIND.ADDRESS,
  Identifier: VALUE_KIND.IDENTIFIER,
  String: VALUE_KIND.STRING,
  Code: VALUE_KIND.STRING,
  Markdown: VALUE_KIND.STRING,
  Uri: VALUE_KIND.STRING,
  Url: VALUE_KIND.STRING,
  Canonical: VALUE_KIND.STRING,
  Oid: VALUE_KIND.STRING,
  Uuid: VALUE_KIND.STRING,
  Id: VALUE_KIND.STRING,
  Base64Binary: VALUE_KIND.STRING,
  Boolean: VALUE_KIND.BOOLEAN,
  Integer: VALUE_KIND.NUMBER,
  Integer64: VALUE_KIND.NUMBER,
  Decimal: VALUE_KIND.NUMBER,
  UnsignedInt: VALUE_KIND.NUMBER,
  PositiveInt: VALUE_KIND.NUMBER,
  DateTime: VALUE_KIND.DATE_TIME,
  Date: VALUE_KIND.DATE_TIME,
  Instant: VALUE_KIND.DATE_TIME,
  Time: VALUE_KIND.DATE_TIME,
};

/** Output formats for {@link formatShape}. */
export const DESCRIBE_FORMAT = {
  /** A readable outline, with a legend of the value shapes used. */
  TREE: 'tree',
  /** A copy-pasteable interface, for modelling against the output. */
  TYPESCRIPT: 'typescript',
} as const;

/**
 * The exported type name for each value kind, so a rendered interface
 * references types a consumer can actually import.
 */
export const VALUE_TYPE_NAME = 'NormalizedValue';

export const TYPE_NAME: Readonly<Record<string, string>> = {
  [VALUE_KIND.CONCEPT]: 'NormalizedConcept',
  [VALUE_KIND.QUANTITY]: 'NormalizedQuantity',
  [VALUE_KIND.RATIO]: 'NormalizedRatio',
  [VALUE_KIND.RANGE]: 'NormalizedRange',
  [VALUE_KIND.REFERENCE]: 'NormalizedReference',
  [VALUE_KIND.PERIOD]: 'NormalizedPeriod',
  [VALUE_KIND.NAME]: 'NormalizedName',
  [VALUE_KIND.CONTACT]: 'NormalizedContactPoint',
  [VALUE_KIND.ADDRESS]: 'NormalizedAddress',
  [VALUE_KIND.IDENTIFIER]: 'NormalizedIdentifier',
  [VALUE_KIND.STRING]: 'NormalizedString',
  [VALUE_KIND.BOOLEAN]: 'NormalizedBoolean',
  [VALUE_KIND.NUMBER]: 'NormalizedNumber',
  [VALUE_KIND.DATE_TIME]: 'NormalizedDateTime',
  [VALUE_KIND.UNKNOWN]: 'NormalizedUnknown',
};

/** Rendered when a value carries no displayable text at all. */
export const EMPTY_TEXT = '—';

/** Separator between the parts of a composed label, e.g. `Body Weight · 74.5 kg`. */
export const LABEL_SEPARATOR = ' · ';

/* ------------------------------------------------------------------ */
/*  Rows                                                               */
/* ------------------------------------------------------------------ */

/** How a repeating element becomes columns. */
export const LIST_MODE = {
  /** The first entry, plus a `_count` column saying how many there were. */
  FIRST: 'first',
  /** Every entry, numbered — `name_0_family`, `name_1_family`. */
  INDEX: 'index',
} as const;

/** What lands in a cell. */
export const CELL_MODE = {
  /** The `text` rendering, one column per field. Lossy by design. */
  TEXT: 'text',
  /** `text`, plus the value's own properties as their own columns. */
  TYPED: 'typed',
} as const;

/**
 * Between the parts of a column name — `component_0_value_unit`.
 *
 * FHIR element names are `[A-Za-z0-9]+`, so an underscore cannot occur inside
 * one and a column name can always be split back into its parts. It is also
 * the one separator that is a legal SQL identifier character unquoted.
 */
export const COLUMN_SEPARATOR = '_';

/** The columns every row starts with, whatever the resource type. */
export const IDENTITY_COLUMN = {
  RESOURCE_TYPE: 'resourceType',
  ID: 'id',
  DISPLAY: 'display',
} as const;

/** Appended to a field's column name for the columns *about* that field. */
export const COLUMN_SUFFIX = {
  /** How many entries the repeating element held. */
  COUNT: 'count',
  /** Which entry an exploded row came from. */
  INDEX: 'index',
  /** The value kind, so a choice column can be read back. */
  KIND: 'kind',
} as const;

/** Joins a repeating primitive — `given` — into one cell. */
export const CELL_LIST_SEPARATOR = ' | ';

/**
 * Value properties a flat cell cannot hold.
 *
 * `codings` is the only one: a CodeableConcept's alternate codings are records,
 * and the primary one is already flattened onto `code`, `system`, and
 * `display`. Anything more belongs in the simplified view, not a table.
 */
export const UNCELLED_PROPERTY: ReadonlySet<string> = new Set(['kind', 'text', 'codings']);
