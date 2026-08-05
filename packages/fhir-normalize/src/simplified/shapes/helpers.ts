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
 * The metadata block every canonical resource carries. Conformance,
 * terminology, and the definitional artefacts are largely made of it, so it is
 * declared once and spread rather than retyped across three dozen resources.
 */
export const canonical: Readonly<Record<string, FieldSpec>> = {
  url: primitive(),
  identifier: identifier(),
  version: primitive(),
  name: primitive(),
  title: primitive(),
  status: primitive(),
  experimental: primitive(),
  date: primitive(),
  publisher: primitive(),
  contact: contact(),
  description: primitive(),
  jurisdiction: concept(true),
  purpose: primitive(),
  copyright: primitive(),
  useContext: group({ code: concept(), value: choice() }),
};

/** Canonical resources that are also versioned artefacts under review. */
export const reviewed: Readonly<Record<string, FieldSpec>> = {
  approvalDate: primitive(),
  lastReviewDate: primitive(),
  effectivePeriod: period(),
  topic: concept(true),
};

/**
 * Authorship roles the evidence and definitional artefacts share, all
 * ContactDetail rather than References.
 */
export const authored: Readonly<Record<string, FieldSpec>> = {
  author: contact(),
  editor: contact(),
  reviewer: contact(),
  endorser: contact(),
};

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

/**
 * Reads `text` from a field nested inside the first entry of a group.
 *
 * A resource whose human name lives in a backbone element — a
 * MedicinalProductDefinition's `name[0].productName`, say — has nothing at the
 * top level for `textOf` to find, so its label would otherwise be just a
 * status code.
 */
export const nestedTextOf = (
  fields: SimplifiedFields,
  key: string,
  nested: string,
): string | null => {
  const field = fields[key];
  const [first] = Array.isArray(field) ? field : [];
  if (first === undefined) return null;

  const value = (first as SimplifiedFields)[nested];
  const target = Array.isArray(value) ? value[0] : value;
  const text: unknown = (target as { text?: unknown } | undefined)?.text;

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
