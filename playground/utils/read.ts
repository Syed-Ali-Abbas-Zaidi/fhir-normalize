import type { UnknownRecord } from '@/types';

export const isPlainObject = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Walk a path through untrusted data, yielding `undefined` at the first miss. */
export const prop = (value: unknown, ...path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (current, key) => (isPlainObject(current) ? current[key] : undefined),
    value,
  );

/** Arrays yield their first item; anything else is returned as-is. */
export const firstOf = (value: unknown): unknown => (Array.isArray(value) ? value[0] : value);

/** Render a scalar for display, or `null` when there is nothing worth showing. */
export const asText = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};
