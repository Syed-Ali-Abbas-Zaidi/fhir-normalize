import { FIELD_KIND, LABEL_SEPARATOR } from './constants';
import type { FieldSpec, ResourceShape, SimplifiedFields } from './types';

const f = (kind: FieldSpec['kind'], list = false): FieldSpec => (list ? { kind, list } : { kind });

const concept = (list = false) => f(FIELD_KIND.CONCEPT, list);
const reference = (list = false) => f(FIELD_KIND.REFERENCE, list);
const primitive = (list = false) => f(FIELD_KIND.PRIMITIVE, list);
const choice = () => f(FIELD_KIND.CHOICE);
const annotation = () => f(FIELD_KIND.ANNOTATION, true);

/**
 * Reads `text` off a normalized field, taking the first entry of a list.
 * Group fields have no `text` of their own and yield `null`.
 */
const textOf = (fields: SimplifiedFields, key: string): string | null => {
  const field = fields[key];
  const value = Array.isArray(field) ? field[0] : field;
  const text: unknown = (value as { text?: unknown } | undefined)?.text;

  return typeof text === 'string' ? text : null;
};

const join = (...parts: (string | null)[]): string | null =>
  parts.filter((part): part is string => part !== null && part !== '—').join(LABEL_SEPARATOR) ||
  null;

/**
 * Per-resource field specs.
 *
 * Curated rather than generated: declaring the fields makes the output
 * predictable, which is the point of this layer. Anything a shape does not
 * declare is reported in `unmapped` instead of being silently dropped, and a
 * resource with no shape at all still gets its choice elements resolved.
 */
export const RESOURCE_SHAPE: Readonly<Record<string, ResourceShape>> = {
  Patient: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      active: primitive(),
      name: f(FIELD_KIND.NAME, true),
      telecom: f(FIELD_KIND.CONTACT, true),
      gender: primitive(),
      birthDate: primitive(),
      deceased: choice(),
      address: f(FIELD_KIND.ADDRESS, true),
      maritalStatus: concept(),
      multipleBirth: choice(),
      generalPractitioner: reference(true),
      managingOrganization: reference(),
    },
    display: (fields) => join(textOf(fields, 'name'), textOf(fields, 'birthDate')),
  },

  Practitioner: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      active: primitive(),
      name: f(FIELD_KIND.NAME, true),
      telecom: f(FIELD_KIND.CONTACT, true),
      gender: primitive(),
      birthDate: primitive(),
      address: f(FIELD_KIND.ADDRESS, true),
      qualification: {
        kind: FIELD_KIND.GROUP,
        list: true,
        fields: { code: concept(), period: f(FIELD_KIND.PERIOD), issuer: reference() },
      },
    },
    display: (fields) => textOf(fields, 'name'),
  },

  Observation: {
    fields: {
      status: primitive(),
      category: concept(true),
      code: concept(),
      subject: reference(),
      encounter: reference(),
      effective: choice(),
      issued: primitive(),
      performer: reference(true),
      value: choice(),
      dataAbsentReason: concept(),
      interpretation: concept(true),
      bodySite: concept(),
      method: concept(),
      specimen: reference(),
      device: reference(),
      hasMember: reference(true),
      derivedFrom: reference(true),
      note: annotation(),
      component: {
        kind: FIELD_KIND.GROUP,
        list: true,
        fields: {
          code: concept(),
          value: choice(),
          dataAbsentReason: concept(),
          interpretation: concept(true),
        },
      },
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'value')),
  },

  Encounter: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      status: primitive(),
      class: concept(),
      type: concept(true),
      serviceType: concept(),
      priority: concept(),
      subject: reference(),
      basedOn: reference(true),
      participant: {
        kind: FIELD_KIND.GROUP,
        list: true,
        fields: {
          type: concept(true),
          period: f(FIELD_KIND.PERIOD),
          individual: reference(),
          actor: reference(),
        },
      },
      period: f(FIELD_KIND.PERIOD),
      reasonCode: concept(true),
      reasonReference: reference(true),
      serviceProvider: reference(),
      partOf: reference(),
    },
    display: (fields) => join(textOf(fields, 'class'), textOf(fields, 'period')),
  },

  Condition: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      clinicalStatus: concept(),
      verificationStatus: concept(),
      category: concept(true),
      severity: concept(),
      code: concept(),
      bodySite: concept(true),
      subject: reference(),
      encounter: reference(),
      onset: choice(),
      abatement: choice(),
      recordedDate: primitive(),
      recorder: reference(),
      asserter: reference(),
      note: annotation(),
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'clinicalStatus')),
  },

  MedicationRequest: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      status: primitive(),
      intent: primitive(),
      category: concept(true),
      priority: primitive(),
      medication: choice(),
      subject: reference(),
      encounter: reference(),
      authoredOn: primitive(),
      requester: reference(),
      performer: reference(),
      reasonCode: concept(true),
      note: annotation(),
      dosageInstruction: {
        kind: FIELD_KIND.GROUP,
        list: true,
        fields: { text: primitive(), route: concept(), site: concept() },
      },
    },
    display: (fields) => join(textOf(fields, 'medication'), textOf(fields, 'status')),
  },

  AllergyIntolerance: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      clinicalStatus: concept(),
      verificationStatus: concept(),
      type: primitive(),
      category: primitive(true),
      criticality: primitive(),
      code: concept(),
      patient: reference(),
      encounter: reference(),
      onset: choice(),
      recordedDate: primitive(),
      note: annotation(),
      reaction: {
        kind: FIELD_KIND.GROUP,
        list: true,
        fields: {
          substance: concept(),
          manifestation: concept(true),
          severity: primitive(),
          exposureRoute: concept(),
        },
      },
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'criticality')),
  },

  Procedure: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      status: primitive(),
      category: concept(),
      code: concept(),
      subject: reference(),
      encounter: reference(),
      performed: choice(),
      performer: {
        kind: FIELD_KIND.GROUP,
        list: true,
        fields: { function: concept(), actor: reference(), onBehalfOf: reference() },
      },
      recorder: reference(),
      asserter: reference(),
      reasonCode: concept(true),
      bodySite: concept(true),
      outcome: concept(),
      note: annotation(),
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'performed')),
  },

  Immunization: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      status: primitive(),
      vaccineCode: concept(),
      patient: reference(),
      encounter: reference(),
      occurrence: choice(),
      recorded: primitive(),
      lotNumber: primitive(),
      expirationDate: primitive(),
      site: concept(),
      route: concept(),
      doseQuantity: f(FIELD_KIND.QUANTITY),
      note: annotation(),
    },
    display: (fields) => join(textOf(fields, 'vaccineCode'), textOf(fields, 'occurrence')),
  },

  DiagnosticReport: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      status: primitive(),
      category: concept(true),
      code: concept(),
      subject: reference(),
      encounter: reference(),
      effective: choice(),
      issued: primitive(),
      performer: reference(true),
      result: reference(true),
      conclusion: primitive(),
      conclusionCode: concept(true),
    },
    display: (fields) => join(textOf(fields, 'code'), textOf(fields, 'status')),
  },

  DocumentReference: {
    fields: {
      identifier: f(FIELD_KIND.IDENTIFIER, true),
      status: primitive(),
      type: concept(),
      category: concept(true),
      subject: reference(),
      date: primitive(),
      author: reference(true),
      description: primitive(),
    },
    display: (fields) => join(textOf(fields, 'type'), textOf(fields, 'status')),
  },
};

/**
 * Elements every resource may carry. Excluded from `unmapped` so plumbing does
 * not read as a coverage gap.
 */
export const COMMON_ELEMENT: ReadonlySet<string> = new Set([
  'resourceType',
  'id',
  'meta',
  'implicitRules',
  'language',
  'text',
  'contained',
  'extension',
  'modifierExtension',
]);
