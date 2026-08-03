import { normalizeByKind } from './choice';
import {
  DESCRIBE_FORMAT,
  FIELD_KIND,
  TYPE_NAME,
  TYPE_SUFFIX_KIND,
  VALUE_KIND,
  VALUE_TYPE_NAME,
} from './constants';
import { CLINICAL_ALIAS, RESOURCE_SHAPE, shapeFor } from './shapes';
import type {
  DescribeFormat,
  FieldKind,
  FieldSpec,
  ShapeDescription,
  ShapeFieldDescription,
  ValueKind,
} from './types';

/**
 * The property names a normalized value of this kind carries.
 *
 * Derived by running the normalizer rather than hand-listed, so the
 * description can never drift from what `simplifyResource` actually produces.
 */
export const valueProperties = (kind: ValueKind): string[] =>
  Object.keys(normalizeByKind(undefined, kind));

/** Every kind a `CHOICE` field can resolve to, in a stable order. */
const choiceKinds = (): ValueKind[] => [...new Set(Object.values(TYPE_SUFFIX_KIND))].sort();

/** A field kind maps to one value kind, except CHOICE and GROUP. */
const fieldValueKind: Partial<Record<FieldKind, ValueKind>> = {
  [FIELD_KIND.CONCEPT]: VALUE_KIND.CONCEPT,
  [FIELD_KIND.QUANTITY]: VALUE_KIND.QUANTITY,
  [FIELD_KIND.RATIO]: VALUE_KIND.RATIO,
  [FIELD_KIND.RANGE]: VALUE_KIND.RANGE,
  [FIELD_KIND.REFERENCE]: VALUE_KIND.REFERENCE,
  [FIELD_KIND.PERIOD]: VALUE_KIND.PERIOD,
  [FIELD_KIND.NAME]: VALUE_KIND.NAME,
  [FIELD_KIND.CONTACT]: VALUE_KIND.CONTACT,
  [FIELD_KIND.ADDRESS]: VALUE_KIND.ADDRESS,
  [FIELD_KIND.IDENTIFIER]: VALUE_KIND.IDENTIFIER,
  [FIELD_KIND.ANNOTATION]: VALUE_KIND.STRING,
};

const describeField = (name: string, spec: FieldSpec): ShapeFieldDescription => {
  const list = spec.list === true;

  if (spec.kind === FIELD_KIND.GROUP) {
    return {
      name,
      kind: spec.kind,
      list,
      valueKinds: [],
      properties: [],
      fields: Object.entries(spec.fields ?? {}).map(([key, nested]) => describeField(key, nested)),
    };
  }

  if (spec.kind === FIELD_KIND.CHOICE) {
    return { name, kind: spec.kind, list, valueKinds: choiceKinds(), properties: [], fields: [] };
  }

  const valueKind = fieldValueKind[spec.kind];
  return {
    name,
    kind: spec.kind,
    list,
    valueKinds: valueKind === undefined ? [] : [valueKind],
    properties: valueKind === undefined ? [] : valueProperties(valueKind),
    fields: [],
  };
};

/**
 * The simplified structure of a resource type, as data.
 *
 * Answers "what will `simplifyResource` give me for an Observation?" without
 * needing a sample payload to find out.
 */
export const describeShape = (resourceType: string): ShapeDescription | null => {
  const shape = shapeFor(resourceType);
  if (!shape) return null;

  const canonical = RESOURCE_SHAPE[resourceType] ? resourceType : CLINICAL_ALIAS[resourceType];

  return {
    resourceType,
    aliasOf: canonical === resourceType ? null : (canonical ?? null),
    fields: Object.entries(shape.fields).map(([name, spec]) => describeField(name, spec)),
  };
};

/** Every resource type with a declared shape, sorted. */
export const listShapes = (): string[] => Object.keys(RESOURCE_SHAPE).sort();

/* ------------------------------------------------------------------ */
/*  Rendering                                                          */
/* ------------------------------------------------------------------ */

const typeLabel = (field: ShapeFieldDescription): string => {
  const base =
    field.kind === FIELD_KIND.GROUP
      ? 'group'
      : field.kind === FIELD_KIND.CHOICE
        ? 'choice'
        : (field.valueKinds[0] ?? field.kind);

  return field.list ? `${base}[]` : base;
};

const treeLines = (fields: readonly ShapeFieldDescription[], depth: number): string[] =>
  fields.flatMap((field) => {
    const indent = '  '.repeat(depth + 1);
    const head = `${indent}${field.name.padEnd(28 - depth * 2)} ${typeLabel(field)}`;

    if (field.kind === FIELD_KIND.GROUP) return [head, ...treeLines(field.fields, depth + 1)];
    return [head];
  });

const renderTree = (description: ShapeDescription): string => {
  const { resourceType, aliasOf, fields } = description;
  const title = aliasOf === null ? resourceType : `${resourceType}  (same shape as ${aliasOf})`;

  // Only kinds a declared field actually resolves to. A choice can be any
  // kind, so folding it in here would list the entire catalogue every time.
  const usedKinds = new Set<ValueKind>();
  let hasChoice = false;
  let hasPrimitive = false;

  const collect = (list: readonly ShapeFieldDescription[]): void => {
    for (const field of list) {
      if (field.kind === FIELD_KIND.CHOICE) {
        hasChoice = true;
      } else {
        if (field.kind === FIELD_KIND.PRIMITIVE) hasPrimitive = true;
        for (const kind of field.valueKinds) usedKinds.add(kind);
      }
      collect(field.fields);
    }
  };
  collect(fields);

  const legend = [...usedKinds]
    .sort()
    .map((kind) => `  ${kind.padEnd(12)} { ${valueProperties(kind).join(', ')} }`);

  const notes = [
    hasPrimitive
      ? `  primitive    resolves to ${VALUE_KIND.STRING}, ${VALUE_KIND.BOOLEAN}, or ${VALUE_KIND.NUMBER} from the payload`
      : null,
    hasChoice
      ? `  choice       any kind above — read \`kind\` to tell which (${choiceKinds().join(', ')})`
      : null,
  ].filter((line): line is string => line !== null);

  return [
    title,
    '',
    ...treeLines(fields, 0),
    '',
    'value shapes',
    ...legend,
    ...(notes.length > 0 ? ['', 'resolved at runtime', ...notes] : []),
    '',
    'every value carries `kind` and `text`; fields absent from the payload are omitted',
  ].join('\n');
};

const interfaceName = (resourceType: string): string => `Simplified${resourceType}`;

const tsType = (field: ShapeFieldDescription, groupName: string): string => {
  const base =
    field.kind === FIELD_KIND.GROUP
      ? groupName
      : field.kind === FIELD_KIND.CHOICE
        ? VALUE_TYPE_NAME
        : (TYPE_NAME[field.valueKinds[0] ?? ''] ?? VALUE_TYPE_NAME);

  return field.list ? `${base}[]` : base;
};

const tsMembers = (
  fields: readonly ShapeFieldDescription[],
  depth: number,
  prefix: string,
): string[] =>
  fields.flatMap((field) => {
    const indent = '  '.repeat(depth + 1);
    const groupName = `${prefix}${field.name[0]?.toUpperCase() ?? ''}${field.name.slice(1)}`;

    if (field.kind === FIELD_KIND.GROUP) {
      const suffix = field.list ? '[]' : '';
      return [
        `${indent}${field.name}?: {`,
        ...tsMembers(field.fields, depth + 1, groupName),
        `${indent}}${suffix};`,
      ];
    }

    return [`${indent}${field.name}?: ${tsType(field, groupName)};`];
  });

/**
 * A copy-pasteable interface for the simplified resource.
 *
 * Every member is optional because a field is omitted when the source resource
 * does not carry it — the shape declares what *can* appear, not what must.
 */
const renderTypescript = (description: ShapeDescription): string => {
  const name = interfaceName(description.aliasOf ?? description.resourceType);

  return [
    `interface ${name} {`,
    '  resourceType: string;',
    '  id: string | null;',
    '  display: string;',
    '  unmapped: string[];',
    '  fields: {',
    ...tsMembers(description.fields, 1, ''),
    '  };',
    '}',
  ].join('\n');
};

const renderers: Record<DescribeFormat, (description: ShapeDescription) => string> = {
  [DESCRIBE_FORMAT.TREE]: renderTree,
  [DESCRIBE_FORMAT.TYPESCRIPT]: renderTypescript,
};

/**
 * Render the simplified structure of a resource type for reading or for
 * pasting into a model.
 *
 * @param resourceType e.g. `Observation`. Renamed types resolve via their alias.
 * @param format `tree` for a readable outline, `typescript` for an interface.
 * @returns The rendered structure, or `null` when the type has no shape.
 */
export const formatShape = (
  resourceType: string,
  format: DescribeFormat = DESCRIBE_FORMAT.TREE,
): string | null => {
  const description = describeShape(resourceType);
  return description === null ? null : renderers[format](description);
};
