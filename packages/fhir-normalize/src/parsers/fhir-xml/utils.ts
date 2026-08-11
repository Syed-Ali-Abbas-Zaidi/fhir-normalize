import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Bundle, FhirResource } from 'fhir/r4';
import {
  assignKey,
  createCollectionBundle,
  isBundleRecord,
  isRecord,
  normalizeBundleRecord,
  ParseError,
  SOURCE_FORMAT,
  type UnknownRecord,
  type WarningLog,
} from '../../core';
import {
  REPEATING_BY_RESOURCE,
  REPEATING_COMMON,
  RESOURCE_CONTAINER_AT,
} from './cardinality.generated';
import {
  ATTRIBUTE_TO_PROPERTY,
  BOOLEAN_ELEMENT,
  BOOLEAN_ELEMENT_SUFFIX,
  FHIR_XML_ERROR,
  FHIR_XML_WARNING,
  NUMERIC_ELEMENT,
  NUMERIC_ELEMENT_SUFFIX,
  QUANTITY_PARENT,
  QUANTITY_SUFFIX,
  QUANTITY_VALUE_ELEMENT,
  REPEATING_ELEMENT,
  REPEATING_PRIMITIVE_ELEMENT,
  REPEATING_RESOURCE_CONTAINER,
  RESOURCE_CONTAINER,
  XML_ATTRIBUTE,
  XML_ATTRIBUTE_PREFIX,
  XML_PARSER_OPTIONS,
} from './constants';

const xmlParser = new XMLParser(XML_PARSER_OPTIONS);
/**
 * Whether this element really wraps a nested resource.
 *
 * Matching the name alone was wrong eighteen times over: `resource` and
 * `outcome` are ordinary elements nearly everywhere they appear, and reading
 * them as wrappers destroyed the data. `Procedure.outcome` came back as
 * `{ resourceType: 'text' }` and `AuditEvent.outcome` disappeared.
 */
const isResourceContainer = (
  elementName: string,
  parentName: string,
  resourceType: string,
): boolean => {
  // Inherited from DomainResource, so it is a container on everything and the
  // element digest — which leaves inherited elements out — cannot say so.
  if (elementName === RESOURCE_CONTAINER.CONTAINED) return true;

  // `Bundle.entry.response.outcome` is the one genuine container below the
  // second level, which is as deep as the digest reaches. Scoped to Bundle so
  // the eighteen other `outcome` elements are left alone.
  if (elementName === RESOURCE_CONTAINER.OUTCOME) return resourceType === 'Bundle';

  const level = parentName === resourceType ? '' : parentName;
  return RESOURCE_CONTAINER_AT.includes(`${resourceType}.${level}.${elementName}`);
};

/** Keys that are real child elements — not attributes, not the `<?xml?>` declaration. */
const elementNames = (record: UnknownRecord): string[] =>
  Object.keys(record).filter(
    (key) => !key.startsWith(XML_ATTRIBUTE_PREFIX) && !key.startsWith('?'),
  );

/**
 * Decode an XML document into fast-xml-parser's intermediate tree.
 *
 * @throws {ParseError} The input is not a string, or is not well-formed XML.
 */
export const decodeXml = (raw: unknown): UnknownRecord => {
  if (typeof raw !== 'string') {
    throw new ParseError(SOURCE_FORMAT.FHIR_XML, FHIR_XML_ERROR.NOT_A_STRING);
  }

  /*
   * `XMLValidator` is deprecated in favour of the separate `fast-xml-validator`
   * package, and stays anyway. That package is ~1 MB with three transitive
   * dependencies and validates against rules and schemas; this needs a
   * well-formedness check, which is all `XMLValidator` does. Trading a method
   * call for a megabyte of runtime dependency on a published healthcare library
   * is the wrong direction.
   *
   * Dropping the check is not the alternative either: the parser is lenient by
   * default and would accept malformed XML, and the `validationOptions`
   * argument that would make it strict is itself deprecated.
   *
   * Revisit when fast-xml-parser 6 removes it, not before. Static analysis
   * flags this deliberately unsuppressed, so the day it stops working is
   * visible rather than silent.
   */
  const validation = XMLValidator.validate(raw);
  if (validation !== true) {
    throw new ParseError(SOURCE_FORMAT.FHIR_XML, FHIR_XML_ERROR.MALFORMED(validation.err.msg));
  }

  // Guarded because the dependency throws on input its own validator accepts —
  // an element named `__proto__`, for one, which it refuses on security
  // grounds. Unwrapped, that reaches the caller as a bare Error even though
  // every other failure here is a ParseError.
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(raw);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new ParseError(SOURCE_FORMAT.FHIR_XML, FHIR_XML_ERROR.REJECTED(detail), { cause });
  }

  return isRecord(parsed) ? parsed : {};
};

/**
 * Map a decoded XML tree onto a canonical R4 Bundle.
 *
 * @throws {ParseError} The document has no root element, or more than one.
 */
export const toBundle = (parsed: UnknownRecord, warnings: WarningLog): Bundle => {
  warnings.add(FHIR_XML_WARNING.INFERRED_MAPPING);

  const roots = elementNames(parsed);
  const [resourceType] = roots;
  if (resourceType === undefined || roots.length > 1) {
    throw new ParseError(SOURCE_FORMAT.FHIR_XML, FHIR_XML_ERROR.UNEXPECTED_ROOTS(roots));
  }

  const record = toResourceRecord(parsed[resourceType], resourceType, warnings);

  return isBundleRecord(record)
    ? normalizeBundleRecord(record, warnings)
    : createCollectionBundle([record as unknown as FhirResource]);
};

/** An element's name becomes the resource's `resourceType` — that is the whole mapping. */
const toResourceRecord = (
  node: unknown,
  resourceType: string,
  warnings: WarningLog,
): UnknownRecord => ({
  resourceType,
  ...(isRecord(node) ? toObject(node, resourceType, resourceType, warnings) : {}),
});

/** Convert one element node into its FHIR JSON value. */
const toValue = (
  node: unknown,
  elementName: string,
  parentName: string,
  resourceType: string,
  warnings: WarningLog,
): unknown => {
  if (Array.isArray(node)) {
    return node.map((item) => toValue(item, elementName, parentName, resourceType, warnings));
  }

  if (!isRecord(node)) return coercePrimitive(node, elementName, parentName);

  const primitive = node[XML_ATTRIBUTE.VALUE];
  if (primitive !== undefined) {
    if (elementNames(node).length > 0) {
      warnings.add(FHIR_XML_WARNING.MIXED_CONTENT(elementName));
    }
    return coercePrimitive(primitive, elementName, parentName);
  }

  return toObject(node, elementName, resourceType, warnings);
};

const toObject = (
  node: UnknownRecord,
  elementName: string,
  resourceType: string,
  warnings: WarningLog,
): UnknownRecord => {
  const result: UnknownRecord = {};

  for (const [key, raw] of Object.entries(node)) {
    if (key.startsWith(XML_ATTRIBUTE_PREFIX)) {
      const property = ATTRIBUTE_TO_PROPERTY[key];
      if (property !== undefined) result[property] = raw;
      continue;
    }

    const value = isResourceContainer(key, elementName, resourceType)
      ? toContainedResources(raw, key, warnings)
      : applyCardinality(
          toValue(raw, key, elementName, resourceType, warnings),
          key,
          elementName,
          resourceType,
        );

    if (value !== undefined) assignKey(result, key, value);
  }

  return result;
};

/**
 * Unwrap `<resource><Patient/></resource>`, the one place FHIR XML nests a
 * resource a level deeper than FHIR JSON does.
 */
const toContainedResources = (
  raw: unknown,
  containerName: string,
  warnings: WarningLog,
): unknown => {
  const nodes = Array.isArray(raw) ? raw : [raw];
  const resources = nodes
    .map((node) => toContainedResource(node, containerName, warnings))
    .filter((resource): resource is UnknownRecord => resource !== null);

  if (REPEATING_RESOURCE_CONTAINER.has(containerName)) return resources;
  return resources[0];
};

const toContainedResource = (
  node: unknown,
  containerName: string,
  warnings: WarningLog,
): UnknownRecord | null => {
  if (!isRecord(node)) {
    warnings.add(FHIR_XML_WARNING.EMPTY_RESOURCE_CONTAINER(containerName));
    return null;
  }

  const found = elementNames(node);
  if (found.length === 0) {
    warnings.add(FHIR_XML_WARNING.EMPTY_RESOURCE_CONTAINER(containerName));
    return null;
  }
  if (found.length > 1) {
    warnings.add(FHIR_XML_WARNING.AMBIGUOUS_RESOURCE_CONTAINER(containerName, found));
    return null;
  }

  const [resourceType] = found as [string];
  return toResourceRecord(node[resourceType], resourceType, warnings);
};

/** The empty key holds a resource's own repeating elements. */
const TOP_LEVEL = '';

/**
 * Whether R4 makes this element `0..*`, according to the specification rather
 * than a guess.
 *
 * Looked up by resource type, because the answer is not a property of the name
 * on its own: `Patient.name` is `0..*` and `Organization.name` is a `0..1`
 * string. Returns `null` where the table cannot say — an unknown resource
 * type, or nesting deeper than the digest reaches — and the caller falls back
 * to the older name-based reading.
 */
const repeatsInR4 = (
  elementName: string,
  parentName: string,
  resourceType: string,
): boolean | null => {
  // Checked first: the digest omits inherited elements, so without this the
  // table would confidently answer "no" for `extension`, which repeats on
  // everything.
  if (REPEATING_COMMON.includes(elementName)) return true;

  const levels = REPEATING_BY_RESOURCE[resourceType];
  if (levels === undefined) return null;

  // `parentName` is the resource itself at the top level, and a backbone one
  // level in. Deeper than that the digest has nothing, so neither do we.
  const level = parentName === resourceType ? levels[TOP_LEVEL] : (levels[parentName] ?? null);
  if (level === null || level === undefined) return null;

  return level.includes(elementName);
};

/**
 * XML cannot say whether a lone element is a single value or a one-item list.
 *
 * Where the specification can answer, it does. Where it cannot — a resource
 * type R4 does not have, or nesting below the second level — this falls back
 * to recognising repeating elements by name, which is what the parser did
 * everywhere before the table existed.
 */
const applyCardinality = (
  value: unknown,
  elementName: string,
  parentName: string,
  resourceType: string,
): unknown => {
  if (Array.isArray(value)) return value;

  const repeats = repeatsInR4(elementName, parentName, resourceType);
  if (repeats !== null) return repeats ? [value] : value;

  if (REPEATING_PRIMITIVE_ELEMENT.has(elementName)) return [value];
  if (REPEATING_ELEMENT.has(elementName) && isRecord(value)) return [value];
  return value;
};

/**
 * Everything in XML is a string. Types are recovered only where the spec makes
 * them unambiguous — `value[x]` suffixes encode their own type, and a handful
 * of element names are fixed-type everywhere. Anything else stays a string
 * rather than risk mangling data (`<postalCode value="02134"/>` must not
 * become 2134).
 */
const coercePrimitive = (value: unknown, elementName: string, parentName: string): unknown => {
  if (typeof value !== 'string') return value;

  if (isBooleanElement(elementName)) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }

  if (isNumericElement(elementName, parentName)) {
    const parsed = Number(value);
    return value.trim() !== '' && Number.isFinite(parsed) ? parsed : value;
  }

  return value;
};

const endsWithAny = (name: string, suffixes: readonly string[]): boolean =>
  suffixes.some((suffix) => name.endsWith(suffix));

const isBooleanElement = (name: string): boolean =>
  BOOLEAN_ELEMENT.has(name) || endsWithAny(name, BOOLEAN_ELEMENT_SUFFIX);

const isNumericElement = (name: string, parentName: string): boolean =>
  NUMERIC_ELEMENT.has(name) ||
  endsWithAny(name, NUMERIC_ELEMENT_SUFFIX) ||
  (name === QUANTITY_VALUE_ELEMENT && isQuantityParent(parentName));

const isQuantityParent = (parentName: string): boolean =>
  QUANTITY_PARENT.has(parentName) || parentName.endsWith(QUANTITY_SUFFIX);
