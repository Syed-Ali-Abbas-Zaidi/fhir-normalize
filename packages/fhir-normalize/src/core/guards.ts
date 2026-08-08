import type { UnknownRecord } from './types';

/** True for plain objects only — arrays and `null` are excluded. */
export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True for a string with at least one non-whitespace character. */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Assign a key that came from untrusted input.
 *
 * `record[key] = value` looks harmless until `key` is `__proto__`, which is an
 * accessor on `Object.prototype` rather than an ordinary name: the assignment
 * replaces the target's prototype instead of adding a property. The object then
 * answers to whatever keys the input chose, and `Object.keys` will not show
 * them.
 *
 * Input here is FHIR from other systems, so a key can be anything. The parsers
 * escape this by building with object spread, which creates an own property;
 * anything assembling a record key by key needs this instead. `__proto__` is
 * kept as a plain own property rather than dropped, so nothing is lost and the
 * two paths agree on what the payload contained.
 */
export const assignKey = (record: UnknownRecord, key: string, value: unknown): void => {
  if (key === '__proto__') {
    Object.defineProperty(record, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    return;
  }

  record[key] = value;
};
