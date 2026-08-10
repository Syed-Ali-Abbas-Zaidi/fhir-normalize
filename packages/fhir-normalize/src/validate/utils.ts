import type { Bundle } from 'fhir/r4';
import { isRecord, type UnknownRecord } from '../core';
import {
  COMMON_ELEMENT,
  VALIDATION_CODE,
  VALIDATION_MESSAGE,
  VALIDATION_SEVERITY,
} from './constants';
import { FHIR_TYPE_NAMES, R4_INDEX } from './r4-index.generated';
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
    if (COMMON_ELEMENT.has(key)) continue;

    const element = keys.get(key);
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
export const validateResource = (resource: unknown, at = ''): ValidationIssue[] => {
  if (!isRecord(resource)) return [];

  const resourceType = typeof resource.resourceType === 'string' ? resource.resourceType : '';
  const elements = R4_INDEX[resourceType];
  const path = at === '' ? resourceType || 'Resource' : at;

  if (elements === undefined) {
    return [
      issue(
        VALIDATION_SEVERITY.WARNING,
        VALIDATION_CODE.UNKNOWN_RESOURCE_TYPE,
        path,
        VALIDATION_MESSAGE.UNKNOWN_RESOURCE_TYPE(resourceType),
      ),
    ];
  }

  const issues: ValidationIssue[] = [];
  checkRecord(resource, elements, path, resourceType, issues);
  return issues;
};

/** Check every resource in a Bundle, with paths that name the entry. */
export const validateBundle = (bundle: Bundle): ValidationIssue[] =>
  (bundle.entry ?? []).flatMap((entry, index) =>
    validateResource(entry.resource, `Bundle.entry[${index}].resource`),
  );
