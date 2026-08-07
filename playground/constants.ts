import { SOURCE_FORMAT } from 'fhir-normalize';
import { CELL_MODE, LIST_MODE } from 'fhir-normalize/simplified';
import type {
  ModeOption,
  RowCellOption,
  RowListOption,
  SampleConfig,
  ShapeFormat,
  TabConfig,
  ThemeOption,
} from '@/types';

/**
 * Parse modes offered by the toggle. The explicit modes are the library's own
 * format tokens, so the control can never drift from what is registered.
 */
export const PARSE_MODE = {
  AUTO: 'auto',
  FHIR_JSON: SOURCE_FORMAT.FHIR_JSON,
  FHIR_XML: SOURCE_FORMAT.FHIR_XML,
  NDJSON: SOURCE_FORMAT.NDJSON,
} as const;

export const OUTPUT_TAB = {
  STANDARD: 'standard',
  NORMALIZED: 'normalized',
  ROWS: 'rows',
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
  { value: PARSE_MODE.NDJSON, label: 'ndjson' },
];

export const TAB_OPTIONS: readonly TabConfig[] = [
  { value: OUTPUT_TAB.STANDARD, label: 'Standard shape' },
  { value: OUTPUT_TAB.NORMALIZED, label: 'Normalized' },
  { value: OUTPUT_TAB.ROWS, label: 'Rows' },
  { value: OUTPUT_TAB.SHAPE, label: 'Shape' },
  { value: OUTPUT_TAB.EXTRACTED, label: 'Extracted' },
  { value: OUTPUT_TAB.WARNINGS, label: 'Warnings' },
];

/** Human labels for a detected format, shown in the pipeline badge. */
export const FORMAT_LABEL: Readonly<Record<string, string>> = {
  [SOURCE_FORMAT.FHIR_JSON]: 'FHIR JSON',
  [SOURCE_FORMAT.FHIR_XML]: 'FHIR XML',
  [SOURCE_FORMAT.NDJSON]: 'NDJSON',
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

/* Rows ------------------------------------------------------------------- */

/**
 * The row controls are built from the library's own option tokens, the same way
 * the parse modes are built from its format tokens — so a mode added to
 * `toRows` fails the in-step test here until the tab offers it.
 */
export const ROW_LIST_OPTIONS: readonly RowListOption[] = [
  { value: LIST_MODE.FIRST, label: 'first + count' },
  { value: LIST_MODE.INDEX, label: 'indexed' },
];

export const ROW_CELL_OPTIONS: readonly RowCellOption[] = [
  { value: CELL_MODE.TEXT, label: 'text' },
  { value: CELL_MODE.TYPED, label: 'typed' },
];

/** The `explode` picker's "off" entry. Empty, because no field is named that. */
export const NO_EXPLODE = '';

export const NO_EXPLODE_LABEL = 'none';

/** Shown when a bundle parsed but produced no rows to project. */
export const NO_ROWS_TEXT = 'Nothing to project into rows in this bundle.';

/** An empty cell reads better as nothing than as the word `null`. */
export const EMPTY_CELL = '';

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
 * One Observation carrying two measurements in a backbone element — the case
 * that makes a flat projection interesting. In the Rows tab, `explode` on
 * `component` turns it into a row for systolic and a row for diastolic.
 */
const bloodPressurePayload = JSON.stringify(
  {
    resourceType: 'Observation',
    id: 'obs-bp',
    status: 'final',
    code: {
      text: 'Blood pressure panel',
      coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }],
    },
    subject: { reference: 'Patient/example-1' },
    effectiveDateTime: '2026-07-20T09:30:00Z',
    component: [
      {
        code: { text: 'Systolic', coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
        valueQuantity: { value: 118, unit: 'mmHg', system: 'http://unitsofmeasure.org' },
      },
      {
        code: { text: 'Diastolic', coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
        valueQuantity: { value: 76, unit: 'mmHg', system: 'http://unitsofmeasure.org' },
      },
    ],
  },
  null,
  2,
);

/**
 * Newline-delimited JSON, one resource per line — the shape a FHIR Bulk Data
 * `$export` returns. Deliberately not pretty-printed: the newlines are the
 * format.
 */
const ndjsonPayload = [
  { resourceType: 'Patient', id: 'pat-1', name: [{ family: 'Ahmed', given: ['Sara'] }] },
  { resourceType: 'Patient', id: 'pat-2', name: [{ family: 'Khan', given: ['Ali'] }] },
  {
    resourceType: 'Observation',
    id: 'obs-1',
    status: 'final',
    code: { text: 'Body Weight' },
    subject: { reference: 'Patient/pat-1' },
    valueQuantity: { value: 61.2, unit: 'kg' },
  },
]
  .map((resource) => JSON.stringify(resource))
  .join('\n');

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
    label: 'Blood pressure',
    payload: bloodPressurePayload,
    hint: 'Two measurements in one resource — try Rows · explode',
  },
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
  {
    label: 'Bulk · NDJSON',
    payload: ndjsonPayload,
    hint: 'One resource per line, as a Bulk Data export arrives',
  },
];

export const [defaultSample] = SAMPLES;
