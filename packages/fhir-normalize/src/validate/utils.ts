import type { Bundle } from 'fhir/r4';
import { isRecord, type UnknownRecord } from '../core';
import {
  DISCRIMINATOR,
  MAX_NESTING,
  VALIDATION_CODE,
  VALIDATION_MESSAGE,
  VALIDATION_SEVERITY,
} from './constants';
import {
  COMMON_ELEMENTS,
  FHIR_TYPE_NAMES,
  R4_INDEX,
  RESOURCE_CONTAINERS,
} from './r4-index.generated';
import type { IndexedElement, ValidationIssue } from './types';

const capitalize = (value: string): string => `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;

type Elements = Readonly<Record<string, IndexedElement>>;

const issue = (
  severity: ValidationIssue['severity'],
  code: ValidationIssue['code'],
  path: string,
  message: string,
): ValidationIssue => ({ severity, code, path, message });

/**
 * The literal keys a payload may carry, mapped back to the element they came
 * from. A choice is expanded per permitted type, because that is how FHIR
 * serializes it: `medication[x]` reaches the wire as
 * `medicationCodeableConcept`, never as `medication`.
 */
const payloadKeys = (elements: Elements): Map<string, IndexedElement> => {
  const keys = new Map<string, IndexedElement>();

  for (const [name, element] of Object.entries(elements)) {
    if (!element.choice) {
      keys.set(name, element);
      continue;
    }

    for (const type of element.types ?? []) keys.set(name + capitalize(type), element);
  }

  return keys;
};

/**
 * A key that is a choice carrying a type R4 forbids, rather than an element R4
 * has never heard of.
 *
 * The distinction is worth drawing: `Observation.valueReference` is a real
 * mistake about a real element and deserves an error, while `valueSet` is not
 * a choice at all and is only a warning. The suffix has to name an actual FHIR
 * datatype for the first reading to hold.
 */
const disallowedChoice = (key: string, elements: Elements): IndexedElement | null => {
  for (const [name, element] of Object.entries(elements)) {
    if (!element.choice || !key.startsWith(name) || key.length === name.length) continue;

    const suffix = key.slice(name.length);
    if (suffix[0] !== suffix[0]?.toUpperCase()) continue;
    if (!FHIR_TYPE_NAMES.has(suffix.toLowerCase())) continue;

    return element;
  }

  return null;
};

/** What to say about a key the index does not know. */
const unrecognised = (
  key: string,
  elements: Elements,
  path: string,
  resourceType: string,
): ValidationIssue => {
  const choice = disallowedChoice(key, elements);

  return choice === null
    ? issue(
        VALIDATION_SEVERITY.WARNING,
        VALIDATION_CODE.UNKNOWN_ELEMENT,
        path,
        VALIDATION_MESSAGE.UNKNOWN_ELEMENT(resourceType),
      )
    : issue(
        VALIDATION_SEVERITY.ERROR,
        VALIDATION_CODE.DISALLOWED_CHOICE_TYPE,
        path,
        VALIDATION_MESSAGE.DISALLOWED_CHOICE_TYPE(choice.types ?? []),
      );
};

/** Whether a required element is present, under any spelling a choice allows. */
const isPresent = (record: UnknownRecord, name: string, element: IndexedElement): boolean =>
  element.choice
    ? (element.types ?? []).some((type) => record[name + capitalize(type)] !== undefined)
    : record[name] !== undefined;

/** Cardinality, and whatever is inside a backbone. */
const checkValue = (
  value: unknown,
  element: IndexedElement,
  path: string,
  resourceType: string,
  issues: ValidationIssue[],
): void => {
  if (!Array.isArray(value)) {
    if (element.list === true) {
      issues.push(
        issue(
          VALIDATION_SEVERITY.ERROR,
          VALIDATION_CODE.EXPECTED_LIST,
          path,
          VALIDATION_MESSAGE.EXPECTED_LIST,
        ),
      );
    }
    if (element.fields && isRecord(value)) {
      checkRecord(value, element.fields, path, resourceType, issues);
    }
    return;
  }

  if (element.list !== true) {
    issues.push(
      issue(
        VALIDATION_SEVERITY.ERROR,
        VALIDATION_CODE.EXPECTED_SINGLE,
        path,
        VALIDATION_MESSAGE.EXPECTED_SINGLE,
      ),
    );
  }
  if (value.length === 0) {
    issues.push(
      issue(
        VALIDATION_SEVERITY.ERROR,
        VALIDATION_CODE.EMPTY_ARRAY,
        path,
        VALIDATION_MESSAGE.EMPTY_ARRAY,
      ),
    );
  }

  const nested = element.fields;
  if (nested === undefined) return;

  value.forEach((item, index) => {
    if (isRecord(item)) checkRecord(item, nested, `${path}[${index}]`, resourceType, issues);
  });
};

/** One record against the elements R4 defines for it. */
const checkRecord = (
  record: UnknownRecord,
  elements: Elements,
  path: string,
  resourceType: string,
  issues: ValidationIssue[],
): void => {
  const keys = payloadKeys(elements);

  for (const [key, value] of Object.entries(record)) {
    if (key === DISCRIMINATOR) continue;

    // Inherited elements are absent from the per-resource index but still have
    // a cardinality worth checking — `extension` given a single object is
    // malformed, and skipping the name entirely would let that through.
    const element = keys.get(key) ?? COMMON_ELEMENTS[key];
    if (element === undefined) {
      issues.push(unrecognised(key, elements, `${path}.${key}`, resourceType));
      continue;
    }

    checkValue(value, element, `${path}.${key}`, resourceType, issues);
  }

  for (const [name, element] of Object.entries(elements)) {
    if (element.required === true && !isPresent(record, name, element)) {
      issues.push(
        issue(
          VALIDATION_SEVERITY.ERROR,
          VALIDATION_CODE.MISSING_REQUIRED,
          `${path}.${name}`,
          VALIDATION_MESSAGE.MISSING_REQUIRED,
        ),
      );
    }
  }
};

/**
 * Check one resource against base R4.
 *
 * Structural conformance only: element names, cardinality, and which types a
 * choice permits. It says nothing about whether a code belongs to its value
 * set, or whether the resource satisfies a profile — see the README.
 *
 * Returns everything it found rather than throwing, because a payload with
 * fifty problems should report fifty.
 */
/**
 * Every resource nested inside this one, with the path that reaches it.
 *
 * Two kinds, and both are resources in their own right rather than data
 * belonging to the parent. `contained` is on every resource, so it is handled
 * here rather than repeated 146 times in the index. The rest are the positions
 * R4 types as `Resource`, which the index carries because they are derived
 * from the definitions: `Bundle.entry.resource` and
 * `Parameters.parameter.resource`, and nothing else in R4.
 */
const nestedResources = (
  resource: UnknownRecord,
  resourceType: string,
  path: string,
): { value: unknown; at: string }[] => {
  const nested: { value: unknown; at: string }[] = [];

  const { contained } = resource;
  if (Array.isArray(contained)) {
    for (const [index, item] of contained.entries()) {
      nested.push({ value: item, at: `${path}.contained[${index}]` });
    }
  }

  for (const container of RESOURCE_CONTAINERS[resourceType] ?? []) {
    const [parent, child] = container.split('.');
    if (parent === undefined) continue;

    // A bare name is a resource held directly; `parent.child` is one held by
    // each entry of a backbone list.
    if (child === undefined) {
      nested.push({ value: resource[parent], at: `${path}.${parent}` });
      continue;
    }

    const entries = resource[parent];
    if (!Array.isArray(entries)) continue;

    for (const [index, item] of entries.entries()) {
      if (!isRecord(item)) continue;
      nested.push({ value: item[child], at: `${path}.${parent}[${index}].${child}` });
    }
  }

  return nested;
};

const collect = (resource: unknown, at: string, depth: number, issues: ValidationIssue[]): void => {
  if (!isRecord(resource)) return;

  const resourceType = typeof resource.resourceType === 'string' ? resource.resourceType : '';
  const elements = R4_INDEX[resourceType];
  const path = at === '' ? resourceType || 'Resource' : at;

  if (depth > MAX_NESTING) {
    issues.push(
      issue(
        VALIDATION_SEVERITY.WARNING,
        VALIDATION_CODE.NESTING_TOO_DEEP,
        path,
        VALIDATION_MESSAGE.NESTING_TOO_DEEP(MAX_NESTING),
      ),
    );
    return;
  }

  if (elements === undefined) {
    issues.push(
      issue(
        VALIDATION_SEVERITY.WARNING,
        VALIDATION_CODE.UNKNOWN_RESOURCE_TYPE,
        path,
        VALIDATION_MESSAGE.UNKNOWN_RESOURCE_TYPE(resourceType),
      ),
    );
    return;
  }

  checkRecord(resource, elements, path, resourceType, issues);

  for (const { value, at: nestedAt } of nestedResources(resource, resourceType, path)) {
    collect(value, nestedAt, depth + 1, issues);
  }
};

export const validateResource = (resource: unknown, at = ''): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  collect(resource, at, 0, issues);
  return issues;
};

/**
 * Check a Bundle and everything in it.
 *
 * The wrapper is a resource with its own contract — `type` is required, and
 * `entry` must be an array — so it is validated too rather than treated as a
 * container that is assumed correct.
 *
 * Descending into the entries is `validateResource`'s job now, because
 * `Bundle.entry.resource` is not special: it is one of the two positions R4
 * types as holding a whole resource, and the other is
 * `Parameters.parameter.resource`. Doing it there rather than here is what
 * makes a Bundle nested inside a Bundle, or a Parameters carrying either, come
 * out checked instead of skipped. This function remains because asking for a
 * Bundle to be validated should not require knowing that.
 */
export const validateBundle = (bundle: Bundle): ValidationIssue[] => validateResource(bundle);
