import { FIELD_KIND, LABEL_SEPARATOR } from '../constants';
import type { FieldSpec, SimplifiedFields } from '../types';

const spec = (kind: FieldSpec['kind'], list = false): FieldSpec =>
  list ? { kind, list } : { kind };

export const concept = (list = false) => spec(FIELD_KIND.CONCEPT, list);
export const reference = (list = false) => spec(FIELD_KIND.REFERENCE, list);
export const primitive = (list = false) => spec(FIELD_KIND.PRIMITIVE, list);
export const identifier = (list = true) => spec(FIELD_KIND.IDENTIFIER, list);
export const quantity = (list = false) => spec(FIELD_KIND.QUANTITY, list);
export const ratio = (list = false) => spec(FIELD_KIND.RATIO, list);
export const range = (list = false) => spec(FIELD_KIND.RANGE, list);
export const period = (list = false) => spec(FIELD_KIND.PERIOD, list);
export const name = (list = true) => spec(FIELD_KIND.NAME, list);
export const contact = (list = true) => spec(FIELD_KIND.CONTACT, list);
export const address = (list = true) => spec(FIELD_KIND.ADDRESS, list);
export const choice = () => spec(FIELD_KIND.CHOICE);
export const annotation = (list = true) => spec(FIELD_KIND.ANNOTATION, list);

/** A backbone element, with its own nested specs. */
export const group = (fields: Readonly<Record<string, FieldSpec>>, list = true): FieldSpec => ({
  kind: FIELD_KIND.GROUP,
  list,
  fields,
});

/**
 * A shared block minus the fields a particular resource does not have.
 *
 * The blocks below hold what *most* of their resources carry, which is not the
 * same as what all of them carry — R4 gives `CodeSystem` no `approvalDate` and
 * `SearchParameter` no `copyright`. Spreading a block unconditionally therefore
 * declares fields that do not exist, and a declared field is documentation:
 * `describeShape` reports it and consumers build against it. Subtracting keeps
 * the block shared without letting it over-claim.
 */
export const without = (
  block: Readonly<Record<string, FieldSpec>>,
  ...absent: string[]
): Readonly<Record<string, FieldSpec>> =>
  Object.fromEntries(Object.entries(block).filter(([key]) => !absent.includes(key)));

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

// Complex datatypes that are not backbone elements but read the same way — a
// fixed set of sub-elements with no `text` rendering of their own. Declared
// once here because they recur across sections.

/** The citation/documentation block hung off `relatedArtifact`. */
export const relatedArtifact = (list = true) =>
  group(
    {
      type: primitive(),
      label: primitive(),
      display: primitive(),
      citation: primitive(),
      url: primitive(),
      resource: primitive(),
    },
    list,
  );

/** Binary content — a photo, a PDF report, a library's source. */
export const attachment = (list = false) =>
  group(
    {
      contentType: primitive(),
      language: primitive(),
      url: primitive(),
      size: primitive(),
      title: primitive(),
      creation: primitive(),
    },
    list,
  );

/** The context an artefact applies in — `useContext` on canonical resources. */
export const usageContext = (list = true) => group({ code: concept(), value: choice() }, list);

/** What data a library or guidance response needs. */
export const dataRequirement = (list = true) =>
  group({ type: primitive(), profile: primitive(true), mustSupport: primitive(true) }, list);

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
