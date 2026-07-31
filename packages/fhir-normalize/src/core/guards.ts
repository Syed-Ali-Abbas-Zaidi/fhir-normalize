import type { UnknownRecord } from './types';

/** True for plain objects only — arrays and `null` are excluded. */
export const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** True for a string with at least one non-whitespace character. */
export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
