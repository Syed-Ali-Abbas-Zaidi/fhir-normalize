import type { VALIDATION_CODE, VALIDATION_SEVERITY } from './constants';

export type ValidationSeverity = (typeof VALIDATION_SEVERITY)[keyof typeof VALIDATION_SEVERITY];
export type ValidationCode = (typeof VALIDATION_CODE)[keyof typeof VALIDATION_CODE];

/**
 * One R4 element, as the generated index carries it.
 *
 * Flags are optional and only present when true, which keeps the generated
 * file to a size worth shipping.
 */
export interface IndexedElement {
  /** `0..*` rather than `0..1`. */
  readonly list?: true;
  /** Minimum cardinality above zero. */
  readonly required?: true;
  /** A `value[x]`-style element, serialized as the base name plus a type. */
  readonly choice?: true;
  /** The FHIR types a choice permits. Meaningless on anything else. */
  readonly types?: readonly string[];
  /** One level inside a backbone element, which is as deep as the digest goes. */
  readonly fields?: Readonly<Record<string, IndexedElement>>;
}

/**
 * One way in which a payload is not R4.
 *
 * A flat list rather than an exception: a resource with fifty problems should
 * report fifty, and stopping at the first would make the rest invisible.
 */
export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: ValidationCode;
  /** Where it is, as `Observation.component[1].code`. */
  readonly path: string;
  readonly message: string;
}
