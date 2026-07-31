import { FIELD_KIND, LABEL_SEPARATOR } from '../constants';
import type { FieldSpec, SimplifiedFields } from '../types';

const spec = (kind: FieldSpec['kind'], list = false): FieldSpec =>
  list ? { kind, list } : { kind };

export const concept = (list = false) => spec(FIELD_KIND.CONCEPT, list);
export const reference = (list = false) => spec(FIELD_KIND.REFERENCE, list);
export const primitive = (list = false) => spec(FIELD_KIND.PRIMITIVE, list);
export const identifier = (list = true) => spec(FIELD_KIND.IDENTIFIER, list);
export const quantity = () => spec(FIELD_KIND.QUANTITY);
export const ratio = () => spec(FIELD_KIND.RATIO);
export const range = () => spec(FIELD_KIND.RANGE);
export const period = () => spec(FIELD_KIND.PERIOD);
export const name = (list = true) => spec(FIELD_KIND.NAME, list);
export const contact = (list = true) => spec(FIELD_KIND.CONTACT, list);
export const address = (list = true) => spec(FIELD_KIND.ADDRESS, list);
export const choice = () => spec(FIELD_KIND.CHOICE);
export const annotation = () => spec(FIELD_KIND.ANNOTATION, true);

/** A backbone element, with its own nested specs. */
export const group = (fields: Readonly<Record<string, FieldSpec>>, list = true): FieldSpec => ({
  kind: FIELD_KIND.GROUP,
  list,
  fields,
});

/**
 * Reads `text` off a normalized field, taking the first entry of a list.
 * Group fields have no `text` of their own and yield `null`.
 */
export const textOf = (fields: SimplifiedFields, key: string): string | null => {
  const field = fields[key];
  const value = Array.isArray(field) ? field[0] : field;
  const text: unknown = (value as { text?: unknown } | undefined)?.text;

  return typeof text === 'string' ? text : null;
};

/** Joins the label parts that are actually present. */
export const join = (...parts: (string | null)[]): string | null =>
  parts.filter((part): part is string => part !== null && part !== '—').join(LABEL_SEPARATOR) ||
  null;

/** `status` shows up on almost every clinical resource. */
export const statusDisplay =
  (primary: string) =>
  (fields: SimplifiedFields): string | null =>
    join(textOf(fields, primary), textOf(fields, 'status'));
