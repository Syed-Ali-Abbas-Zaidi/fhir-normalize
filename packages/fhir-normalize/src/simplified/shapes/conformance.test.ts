import { describe, expect, it } from 'vitest';
import R4_ELEMENTS from '../../../spec/r4-elements.json' with { type: 'json' };
import { FIELD_KIND } from '../constants';
import type { FieldSpec } from '../types';
import { RESOURCE_SHAPE } from './index';

/**
 * The shape tables checked against the R4 spec itself.
 *
 * The tables were originally written from knowledge of FHIR and verified only
 * against payloads written from that same knowledge — so an element that did
 * not exist, or existed with a different cardinality, was invisible. This
 * suite closes that loop: `spec/r4-elements.json` is a digest of the published
 * R4 `StructureDefinition`s (regenerate with `scripts/fetch-r4-spec.mjs`), and
 * every declared field is checked against it.
 *
 * A declared field is documentation — `describeShape` reports it and consumers
 * build their models against it — so declaring one R4 does not have is a
 * defect even though nothing fails at runtime.
 */

type SpecElement = {
  readonly types: readonly string[];
  readonly list: boolean;
  readonly choice: boolean;
  readonly required: boolean;
};

const spec: Record<string, Record<string, SpecElement>> = R4_ELEMENTS;

/** FHIR datatype to the {@link FIELD_KIND} a correct declaration would use. */
const KIND_OF_TYPE: Readonly<Record<string, FieldSpec['kind']>> = {
  CodeableConcept: FIELD_KIND.CONCEPT,
  Coding: FIELD_KIND.CONCEPT,
  Reference: FIELD_KIND.REFERENCE,
  Quantity: FIELD_KIND.QUANTITY,
  Age: FIELD_KIND.QUANTITY,
  Count: FIELD_KIND.QUANTITY,
  Distance: FIELD_KIND.QUANTITY,
  Duration: FIELD_KIND.QUANTITY,
  Money: FIELD_KIND.QUANTITY,
  SimpleQuantity: FIELD_KIND.QUANTITY,
  Ratio: FIELD_KIND.RATIO,
  Range: FIELD_KIND.RANGE,
  Period: FIELD_KIND.PERIOD,
  HumanName: FIELD_KIND.NAME,
  ContactPoint: FIELD_KIND.CONTACT,
  ContactDetail: FIELD_KIND.CONTACT,
  Address: FIELD_KIND.ADDRESS,
  Identifier: FIELD_KIND.IDENTIFIER,
  Annotation: FIELD_KIND.ANNOTATION,
  BackboneElement: FIELD_KIND.GROUP,
  Element: FIELD_KIND.GROUP,
};

const PRIMITIVE_TYPE: ReadonlySet<string> = new Set([
  'string',
  'code',
  'uri',
  'url',
  'canonical',
  'boolean',
  'integer',
  'decimal',
  'dateTime',
  'date',
  'instant',
  'time',
  'markdown',
  'id',
  'oid',
  'uuid',
  'base64Binary',
  'positiveInt',
  'unsignedInt',
  'xhtml',
]);

/** The kind the spec implies, or `null` where any reading is defensible. */
const kindFor = (element: SpecElement): FieldSpec['kind'] | null => {
  if (element.choice) return FIELD_KIND.CHOICE;

  const [type] = element.types;
  if (type === undefined) return null;

  return PRIMITIVE_TYPE.has(type) ? FIELD_KIND.PRIMITIVE : (KIND_OF_TYPE[type] ?? null);
};

/**
 * Shapes for resource types R4 does not have. Later releases renamed or added
 * these, and a bundle carrying one still benefits from a curated shape, so
 * they are declared deliberately and excluded from the R4 check.
 */
const NON_R4_SHAPE: ReadonlySet<string> = new Set([
  'ActorDefinition',
  'AdministrableProductDefinition',
  'ArtifactAssessment',
  'ClinicalUseDefinition',
  'DeviceAlert',
  'ImagingSelection',
  'Ingredient',
  'ManufacturedItemDefinition',
  'MedicinalProductDefinition',
  'NutritionIntake',
  'NutritionProduct',
  'PackagedProductDefinition',
  'RegulatedAuthorization',
  'Requirements',
  'SubscriptionStatus',
  'SubscriptionTopic',
  'SubstanceDefinition',
]);

/** Every (resourceType, field, spec) triple a shape declares for an R4 type. */
const declarations = Object.entries(RESOURCE_SHAPE)
  .filter(([resourceType]) => !NON_R4_SHAPE.has(resourceType))
  .flatMap(([resourceType, shape]) =>
    Object.entries(shape.fields).map(([field, fieldSpec]) => ({
      resourceType,
      field,
      fieldSpec,
      element: spec[resourceType]?.[field],
    })),
  );

describe('shape tables conform to R4', () => {
  it('declares only fields R4 has', () => {
    const phantom = declarations
      .filter(({ element }) => element === undefined)
      .map(({ resourceType, field }) => `${resourceType}.${field}`);

    expect(phantom).toEqual([]);
  });

  it('agrees with R4 on whether a field repeats', () => {
    const wrong = declarations
      .filter(({ element }) => element !== undefined)
      .filter(({ fieldSpec, element }) => (fieldSpec.list === true) !== element?.list)
      .map(
        ({ resourceType, field, element }) =>
          `${resourceType}.${field} declared ${element?.list ? '0..1' : '0..*'}, R4 says ${
            element?.list ? '0..*' : '0..1'
          }`,
      );

    expect(wrong).toEqual([]);
  });

  it('reads each field as the kind its R4 type implies', () => {
    const wrong = declarations
      .filter(({ element }) => element !== undefined)
      // `primitive` is a lossless fallback for any type — only a positive
      // contradiction is a defect.
      .filter(({ fieldSpec }) => fieldSpec.kind !== FIELD_KIND.PRIMITIVE)
      .flatMap(({ resourceType, field, fieldSpec, element }) => {
        const expected = element === undefined ? null : kindFor(element);
        if (expected === null || expected === fieldSpec.kind) return [];

        return [
          `${resourceType}.${field} declared ${fieldSpec.kind}, R4 type ${element?.types[0]} implies ${expected}`,
        ];
      });

    expect(wrong).toEqual([]);
  });

  it('declares every element R4 makes mandatory', () => {
    const missing = Object.entries(spec).flatMap(([resourceType, fields]) => {
      const declared = RESOURCE_SHAPE[resourceType]?.fields;
      if (declared === undefined) return [];

      return Object.entries(fields)
        .filter(([field, element]) => element.required && !(field in declared))
        .map(([field]) => `${resourceType}.${field}`);
    });

    expect(missing).toEqual([]);
  });

  it('covers every R4 resource except the documented exclusions', () => {
    // R5 replaced these wholesale with the `*Definition` resources, which are
    // covered instead. See the note in `specialized.ts`.
    const excluded = /^(MedicinalProduct|Substance)/;

    const uncovered = Object.keys(spec).filter(
      (resourceType) => !(resourceType in RESOURCE_SHAPE) && !excluded.test(resourceType),
    );

    expect(uncovered).toEqual([]);
  });
});
