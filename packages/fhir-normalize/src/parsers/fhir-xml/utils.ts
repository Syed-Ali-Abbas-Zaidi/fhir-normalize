import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Bundle, FhirResource } from 'fhir/r4';
import {
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
const resourceContainers = new Set<string>(Object.values(RESOURCE_CONTAINER));

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

  const validation = XMLValidator.validate(raw);
  if (validation !== true) {
    throw new ParseError(SOURCE_FORMAT.FHIR_XML, FHIR_XML_ERROR.MALFORMED(validation.err.msg));
  }

  const parsed: unknown = xmlParser.parse(raw);
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
  ...(isRecord(node) ? toObject(node, resourceType, warnings) : {}),
});

/** Convert one element node into its FHIR JSON value. */
const toValue = (
  node: unknown,
  elementName: string,
  parentName: string,
  warnings: WarningLog,
): unknown => {
  if (Array.isArray(node)) {
    return node.map((item) => toValue(item, elementName, parentName, warnings));
  }

  if (!isRecord(node)) return coercePrimitive(node, elementName, parentName);

  const primitive = node[XML_ATTRIBUTE.VALUE];
  if (primitive !== undefined) {
    if (elementNames(node).length > 0) {
      warnings.add(FHIR_XML_WARNING.MIXED_CONTENT(elementName));
    }
    return coercePrimitive(primitive, elementName, parentName);
  }

  return toObject(node, elementName, warnings);
};

const toObject = (
  node: UnknownRecord,
  elementName: string,
  warnings: WarningLog,
): UnknownRecord => {
  const result: UnknownRecord = {};

  for (const [key, raw] of Object.entries(node)) {
    if (key.startsWith(XML_ATTRIBUTE_PREFIX)) {
      const property = ATTRIBUTE_TO_PROPERTY[key];
      if (property !== undefined) result[property] = raw;
      continue;
    }

    const value = resourceContainers.has(key)
      ? toContainedResources(raw, key, warnings)
      : applyCardinality(toValue(raw, key, elementName, warnings), key);

    if (value !== undefined) result[key] = value;
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

/**
 * XML cannot say whether a lone element is a single value or a one-item list,
 * so repeating elements are recognised by name. Complex-typed names only array
 * when the value is actually an object, which keeps `Organization.name` (a
 * `0..1` string) scalar while `Patient.name` (a `0..*` HumanName) arrays.
 */
const applyCardinality = (value: unknown, elementName: string): unknown => {
  if (Array.isArray(value)) return value;
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
