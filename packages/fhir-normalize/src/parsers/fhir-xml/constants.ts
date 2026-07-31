import type { X2jOptions } from 'fast-xml-parser';

export const XML_ATTRIBUTE_PREFIX = '@_';

/**
 * FHIR XML puts primitive data in a `value` attribute, extension URLs in `url`,
 * and element ids in `id`. Everything else on an element is serialization noise.
 */
export const XML_ATTRIBUTE = {
  VALUE: `${XML_ATTRIBUTE_PREFIX}value`,
  URL: `${XML_ATTRIBUTE_PREFIX}url`,
  ID: `${XML_ATTRIBUTE_PREFIX}id`,
} as const;

/** Attributes that survive into the JSON model, mapped to their property name. */
export const ATTRIBUTE_TO_PROPERTY: Readonly<Record<string, string>> = {
  [XML_ATTRIBUTE.URL]: 'url',
  [XML_ATTRIBUTE.ID]: 'id',
};

/**
 * `stopNodes` keeps the XHTML narrative as a raw string instead of parsing it
 * into element nodes — `Narrative.div` is a string in FHIR JSON, not a tree.
 * Values are left unparsed so primitive typing stays ours to decide, rather
 * than letting the XML layer guess (which would turn a `00123` id into 123).
 */
export const XML_PARSER_OPTIONS: X2jOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: XML_ATTRIBUTE_PREFIX,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  removeNSPrefix: true,
  stopNodes: ['*.div'],
};

/** Elements that hold a nested resource: `<resource><Patient/></resource>`. */
export const RESOURCE_CONTAINER = {
  RESOURCE: 'resource',
  CONTAINED: 'contained',
  OUTCOME: 'outcome',
} as const;

/** Of the containers above, the ones that are `0..*` rather than `0..1`. */
export const REPEATING_RESOURCE_CONTAINER: ReadonlySet<string> = new Set([
  RESOURCE_CONTAINER.CONTAINED,
]);

/**
 * Complex-typed elements that are `0..*` everywhere they appear in R4.
 *
 * XML cannot express cardinality, so a single `<name>` is indistinguishable
 * from a one-item list. These names are force-arrayed, but only when the value
 * is an object — that keeps `Organization.name` (a plain string, `0..1`) scalar
 * while `Patient.name` (a HumanName, `0..*`) becomes an array.
 */
export const REPEATING_ELEMENT: ReadonlySet<string> = new Set([
  'entry',
  'extension',
  'modifierExtension',
  'identifier',
  'name',
  'telecom',
  'address',
  'coding',
  'link',
  'communication',
  'photo',
  'contact',
  'category',
  'performer',
  'component',
  'note',
  'basedOn',
  'partOf',
  'participant',
  'qualification',
  'reaction',
  'ingredient',
  'dosageInstruction',
  'item',
  'answer',
]);

/** Primitive-typed elements that are `0..*`, so they array even when scalar. */
export const REPEATING_PRIMITIVE_ELEMENT: ReadonlySet<string> = new Set([
  'given',
  'prefix',
  'suffix',
  'line',
  'alias',
]);

/**
 * `value[x]` suffixes encode the FHIR type in the element name, so these are
 * inferred from the spec rather than guessed: `valueInteger` is an integer
 * wherever it appears.
 */
export const NUMERIC_ELEMENT_SUFFIX: readonly string[] = [
  'Integer',
  'Decimal',
  'UnsignedInt',
  'PositiveInt',
];

export const BOOLEAN_ELEMENT_SUFFIX: readonly string[] = ['Boolean'];

/** Fixed-name elements whose R4 type is numeric wherever they appear. */
export const NUMERIC_ELEMENT: ReadonlySet<string> = new Set([
  'total',
  'rank',
  'sequence',
  'factor',
  'precision',
]);

/** Fixed-name elements whose R4 type is boolean wherever they appear. */
export const BOOLEAN_ELEMENT: ReadonlySet<string> = new Set([
  'active',
  'experimental',
  'abstract',
  'preferred',
  'primarySource',
  'userSelected',
]);

/**
 * Parents whose `value` child is a Quantity magnitude, and therefore numeric.
 * Anything ending in `Quantity` is covered separately by {@link QUANTITY_SUFFIX}.
 */
export const QUANTITY_PARENT: ReadonlySet<string> = new Set([
  'low',
  'high',
  'numerator',
  'denominator',
  'age',
  'duration',
]);

/** `valueQuantity`, `doseQuantity`, `netQuantity`, … all hold a numeric `value`. */
export const QUANTITY_SUFFIX = 'Quantity';

/** The child element carrying a Quantity's magnitude. */
export const QUANTITY_VALUE_ELEMENT = 'value';

export const FHIR_XML_WARNING = {
  /**
   * Standing warning. XML ships no schema, so both cardinality and primitive
   * typing are inferred. Saying so once is more useful than staying silent
   * about a limitation that applies to every XML parse.
   */
  INFERRED_MAPPING:
    'FHIR XML carries no schema, so cardinality and primitive types are inferred: elements outside the known repeating set stay scalar when they occur once, and primitives outside the known typed set stay strings.',
  MIXED_CONTENT: (at: string): string =>
    `${at} has both a "value" attribute and child elements — the attribute won and the children were dropped.`,
  EMPTY_RESOURCE_CONTAINER: (at: string): string => `${at} holds no resource element — dropped.`,
  AMBIGUOUS_RESOURCE_CONTAINER: (at: string, found: readonly string[]): string =>
    `${at} holds ${found.length} elements (${found.join(', ')}) where exactly one resource was expected — dropped.`,
} as const;

export const FHIR_XML_ERROR = {
  MALFORMED: (detail: string): string => `Input is not well-formed XML: ${detail}`,
  NOT_A_STRING: 'FHIR XML input must be a string.',
  /**
   * Defensive only: `XMLValidator` rejects documents without exactly one root
   * before this can be reached. It stays so the root destructure is sound.
   */
  UNEXPECTED_ROOTS: (found: readonly string[]): string =>
    `XML has ${found.length} root elements (${found.join(', ') || 'none'}); exactly one is required.`,
} as const;
