import { SOURCE_FORMAT } from 'fhir-normalize';
import type { ModeOption, SampleConfig, ShapeFormat, TabConfig, ThemeOption } from '@/types';

/**
 * Parse modes offered by the toggle. The two explicit modes are the library's
 * own format tokens, so the control can never drift from what is registered.
 */
export const PARSE_MODE = {
  AUTO: 'auto',
  FHIR_JSON: SOURCE_FORMAT.FHIR_JSON,
  FHIR_XML: SOURCE_FORMAT.FHIR_XML,
} as const;

export const OUTPUT_TAB = {
  STANDARD: 'standard',
  NORMALIZED: 'normalized',
  SHAPE: 'shape',
  EXTRACTED: 'extracted',
  WARNINGS: 'warnings',
} as const;

/**
 * The three theme preferences. `SYSTEM` is a preference, never a surface — it
 * resolves to `LIGHT` or `DARK` before anything reaches the DOM.
 */
export const THEME = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;

/** What a first-time visitor gets: whatever their OS already asks for. */
export const DEFAULT_THEME = THEME.SYSTEM;

export const THEME_STORAGE_KEY = 'fhir-normalize:theme';

/** The attribute every theme block in `app/theme.css` is scoped to. */
export const THEME_ATTRIBUTE = 'data-theme';

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: THEME.LIGHT, label: 'Light' },
  { value: THEME.DARK, label: 'Dark' },
  { value: THEME.SYSTEM, label: 'System' },
];

/**
 * Runs in `<head>` before first paint, so the page never flashes the wrong
 * surface and then corrects itself. It is deliberately a duplicate of the
 * store's resolution logic — the store cannot run this early — but it is built
 * from the same constants, so the two cannot disagree about names or values.
 */
export const THEME_BOOTSTRAP_SCRIPT = `
(() => {
  try {
    const stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    const explicit = stored === '${THEME.LIGHT}' || stored === '${THEME.DARK}';
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
    const resolved = explicit ? stored : (prefersDark ? '${THEME.DARK}' : '${THEME.LIGHT}');
    document.documentElement.setAttribute('${THEME_ATTRIBUTE}', resolved);
  } catch {
    /* Storage blocked; the stylesheet's own default stands. */
  }
})();
`;

/** The global accessibility utility in `app/globals.css`, not a module class. */
export const VISUALLY_HIDDEN = 'visually-hidden';

export const RESULT_STATE = {
  EMPTY: 'empty',
  OK: 'ok',
  ERROR: 'error',
} as const;

/** Syntax-highlight token kinds. Each maps to one CSS class in the console. */
export const JSON_TOKEN = {
  KEY: 'key',
  STRING: 'string',
  NUMBER: 'number',
  LITERAL: 'literal',
  PLAIN: 'plain',
} as const;

/** Resource types the Extracted tab knows how to summarize. */
export const SUMMARIZED_TYPE = {
  PATIENT: 'Patient',
  OBSERVATION: 'Observation',
  ENCOUNTER: 'Encounter',
  MEDICATION_REQUEST: 'MedicationRequest',
  PRACTITIONER: 'Practitioner',
} as const;

export const UNKNOWN_RESOURCE_TYPE = 'Unknown';

/** Pipeline stages, in order. This strip is the page's signature element. */
export const PIPELINE_STAGE = {
  RAW: 'raw input',
  DETECT: 'detect',
  NORMALIZE: 'normalize',
  STANDARD: 'standard shape',
} as const;

export const MODE_OPTIONS: readonly ModeOption[] = [
  { value: PARSE_MODE.AUTO, label: 'auto' },
  { value: PARSE_MODE.FHIR_JSON, label: 'json' },
  { value: PARSE_MODE.FHIR_XML, label: 'xml' },
];

export const TAB_OPTIONS: readonly TabConfig[] = [
  { value: OUTPUT_TAB.STANDARD, label: 'Standard shape' },
  { value: OUTPUT_TAB.NORMALIZED, label: 'Normalized' },
  { value: OUTPUT_TAB.SHAPE, label: 'Shape' },
  { value: OUTPUT_TAB.EXTRACTED, label: 'Extracted' },
  { value: OUTPUT_TAB.WARNINGS, label: 'Warnings' },
];

/** Human labels for a detected format, shown in the pipeline badge. */
export const FORMAT_LABEL: Readonly<Record<string, string>> = {
  [SOURCE_FORMAT.FHIR_JSON]: 'FHIR JSON',
  [SOURCE_FORMAT.FHIR_XML]: 'FHIR XML',
};

/** Shown in the detect badge when nothing matches. */
export const NO_FORMAT_BADGE = '—';

export const COPY_RESET_MS = 1400;

/** Label for the de-identification toggle. */
export const DEIDENTIFY_LABEL = 'de-identify';

/** Shown in the Shape tab when a resource type has no declared shape. */
export const NO_SHAPE_TEXT =
  'This resource type has no declared shape. Its choice elements are still resolved, but its fields have no curated ordering.';

/** Sections of the FHIR resource list, used to group the shape picker. */
export const SHAPE_SECTION = {
  BASE: 'Base',
  CLINICAL: 'Clinical',
  FOUNDATION: 'Foundation',
} as const;

/** Rendering formats offered in the Shape tab. */
export const SHAPE_FORMAT = {
  TREE: 'tree',
  TYPESCRIPT: 'typescript',
} as const;

export const SHAPE_FORMAT_OPTIONS: readonly { value: ShapeFormat; label: string }[] = [
  { value: SHAPE_FORMAT.TREE, label: 'outline' },
  { value: SHAPE_FORMAT.TYPESCRIPT, label: 'typescript' },
];

/** Where the Shape tab starts before anything has been parsed. */
export const DEFAULT_SHAPE_TYPE = 'Observation';

const patientPayload = JSON.stringify(
  {
    resourceType: 'Patient',
    id: 'example-1',
    name: [{ use: 'official', family: 'Khan', given: ['Ali'] }],
    gender: 'male',
    birthDate: '1996-04-12',
    telecom: [{ system: 'email', value: 'ali@example.com' }],
  },
  null,
  2,
);

const observationPayload = JSON.stringify(
  {
    resourceType: 'Observation',
    id: 'obs-weight',
    status: 'final',
    code: {
      text: 'Body Weight',
      coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body Weight' }],
    },
    subject: { reference: 'Patient/example-1' },
    effectiveDateTime: '2026-07-20T09:30:00Z',
    valueQuantity: { value: 74.5, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
  },
  null,
  2,
);

const bundlePayload = JSON.stringify(
  {
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      {
        resource: {
          resourceType: 'Patient',
          id: 'example-1',
          name: [{ family: 'Khan', given: ['Ali'] }],
          gender: 'male',
          birthDate: '1996-04-12',
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          id: 'obs-weight',
          status: 'final',
          code: { text: 'Body Weight' },
          subject: { reference: 'Patient/example-1' },
          valueQuantity: { value: 74.5, unit: 'kg' },
        },
      },
    ],
  },
  null,
  2,
);

const patientXmlPayload = `<Patient xmlns="http://hl7.org/fhir">
  <id value="example-xml"/>
  <name>
    <use value="official"/>
    <family value="Ahmed"/>
    <given value="Sara"/>
  </name>
  <gender value="female"/>
  <birthDate value="1991-11-03"/>
  <active value="true"/>
</Patient>`;

const observationXmlPayload = `<Observation xmlns="http://hl7.org/fhir">
  <id value="obs-weight"/>
  <status value="final"/>
  <code><text value="Body Weight"/></code>
  <subject><reference value="Patient/example-1"/></subject>
  <valueQuantity>
    <value value="74.5"/>
    <unit value="kg"/>
  </valueQuantity>
</Observation>`;

const stu3Payload = JSON.stringify(
  {
    resourceType: 'Observation',
    id: 'obs-stu3',
    status: 'final',
    code: { text: 'Body Weight' },
    context: { reference: 'Encounter/enc-1' },
    comment: 'Taken after fasting.',
  },
  null,
  2,
);

/**
 * Single source for the sample buttons. Each one demonstrates a different
 * capability, and `hint` says which — a sample nobody understands the point of
 * is just filler.
 */
export const SAMPLES: readonly SampleConfig[] = [
  { label: 'Patient', payload: patientPayload, hint: 'A single R4 resource, wrapped in a Bundle' },
  {
    label: 'Observation',
    payload: observationPayload,
    hint: 'A measurement with a typed quantity',
  },
  { label: 'Bundle', payload: bundlePayload, hint: 'An R4 Bundle, passed through as-is' },
  {
    label: 'Patient · XML',
    payload: patientXmlPayload,
    hint: 'FHIR XML, mapped onto the same shape',
  },
  {
    label: 'Observation · XML',
    payload: observationXmlPayload,
    hint: 'XML values recovered as real numbers',
  },
  {
    label: 'Observation · STU3',
    payload: stu3Payload,
    hint: 'An older release, migrated to R4',
  },
];

export const [defaultSample] = SAMPLES;
