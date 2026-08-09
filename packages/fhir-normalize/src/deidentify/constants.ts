import type { DeIdentifyOptions } from './types';

/**
 * What the pass decides to do with one element. Also the vocabulary the
 * report is expressed in, so a caller can interpret it without guessing.
 */
export const DEID_ACTION = {
  /** Remove the element. */
  REDACT: 'redact',
  /** Replace with a stable surrogate. */
  PSEUDONYMIZE: 'pseudonymize',
  /** Keep the year, drop the rest. */
  GENERALIZE_DATE: 'generalizeDate',
  /** Leave untouched, because the caller asked for it. */
  KEEP: 'keep',
  /** Not identifying in itself — descend and judge the children. */
  RECURSE: 'recurse',
} as const;

export const DATE_POLICY = {
  /** Keep the year, drop month, day, and time. */
  YEAR: 'year',
  REDACT: 'redact',
  KEEP: 'keep',
} as const;

export const FREE_TEXT_POLICY = {
  REDACT: 'redact',
  KEEP: 'keep',
} as const;

export const DEID_TRANSFORM_NAME = 'de-identify';

/**
 * Direct identifiers, removed wherever they appear.
 *
 * Matched on element name at any depth, which is blunt but predictable — the
 * alternative is a per-resource map that silently misses the resource types it
 * does not know about.
 */
export const REDACT_ELEMENT: ReadonlySet<string> = new Set([
  'name',
  'telecom',
  'address',
  'photo',
  'contact',
  // The narrative is rendered prose and routinely repeats the patient's full
  // identity, so it goes even though `text` elsewhere is clinical vocabulary.
  'div',
  'deviceName',
  'serialNumber',
  'lotNumber',
  'url',
  'nameReference',
  'patientInstruction',
  // `Location.position` is latitude and longitude, which fixes a building far
  // more precisely than the `address` two lines up. Removing one and keeping
  // the other removes nothing.
  'position',
  // `Device.udiCarrier` carries the serial number again — `(21)` is the AIDC
  // application identifier for exactly the `serialNumber` above.
  'udiCarrier',
]);

/** Clinician-authored prose. Governed by the `freeText` option. */
export const FREE_TEXT_ELEMENT: ReadonlySet<string> = new Set([
  'note',
  'description',
  'comment',
  'conclusion',
  'summary',
  'extraDetails',
  'instruction',
  'preparationInstruction',
  'observedSeq',
]);

/**
 * Elements whose *name* is never an identifier, so the redact list must not
 * swallow them. `Coding.display` is clinical vocabulary; `Reference.display`
 * is usually a person's name and is handled contextually instead.
 */
export const NEVER_REDACT_ELEMENT: ReadonlySet<string> = new Set([
  'resourceType',
  'status',
  'code',
  'system',
  'unit',
  'kind',
]);

/**
 * How deep the scrub will walk before it stops and drops the rest.
 *
 * The pass is recursive, so a payload nested deeply enough exhausts the call
 * stack — which happened around 1,300 levels, and a JSON string can be parsed
 * to about 3,000 before `JSON.parse` itself gives up. Input here comes from
 * other systems, so that is reachable rather than theoretical.
 *
 * Real FHIR does not go remotely this deep. The recursive elements are
 * `Questionnaire.item` and `Consent.provision`, and a demanding questionnaire
 * is a few dozen levels at most, so 100 leaves an order of magnitude of room
 * while staying an order of magnitude below the stack.
 */
export const MAX_DEPTH = 100;

/** Reported when {@link MAX_DEPTH} stops the walk, so the loss is not silent. */
export const DEPTH_LIMIT_LABEL = '(nesting beyond the depth limit)';

/** A FHIR date, dateTime, or instant with at least a month component. */
export const DATE_PATTERN = /^\d{4}-\d{2}/;

/** Bare `YYYY`, already year-only, so generalizing is a no-op. */
export const YEAR_PATTERN = /^\d{4}$/;

export const DEFAULT_OPTIONS: Required<Omit<DeIdentifyOptions, 'keep'>> & {
  keep: readonly string[];
} = {
  dates: DATE_POLICY.YEAR,
  freeText: FREE_TEXT_POLICY.REDACT,
  pseudonymizeIds: true,
  salt: '',
  keep: [],
};

export const DEID_WARNING = {
  SUMMARY: (report: {
    redacted: number;
    pseudonymized: number;
    datesGeneralized: number;
  }): string =>
    `De-identified: ${report.redacted} element(s) redacted, ${report.pseudonymized} pseudonymized, ${report.datesGeneralized} date(s) reduced to a year.`,
  FREE_TEXT_KEPT:
    'Free text was kept. Clinician-authored prose routinely names patients, relatives, and dates, and no structural rule finds that reliably — review it separately.',
  NOT_CERTIFIED:
    'This is a structural de-identification pass, not a certified HIPAA Safe Harbor or GDPR anonymisation. Verify against your own obligations before releasing data.',
} as const;
