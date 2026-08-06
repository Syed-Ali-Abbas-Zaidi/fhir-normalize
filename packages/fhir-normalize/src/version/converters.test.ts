import { describe, expect, it } from 'vitest';
import {
  toAnnotations,
  toFirstCoding,
  toList,
  toMedicationChoice,
  toReferenceList,
  toRequesterReference,
} from './converters';

/**
 * The converters are the only code in the library that *rewrites* clinical
 * data rather than reading it, and whatever they return is written into the
 * resource unchecked. A wrong result is a bundle that claims to be R4 and is
 * not — invisible until something downstream chokes on it.
 *
 * They also run on data from another release, so malformed input is the
 * ordinary case, not the exotic one. Each converter is checked against the R4
 * element it writes to: `Observation.note` is `Annotation[]`,
 * `Observation.hasMember` is `Reference[]`, `Encounter.class` is a single
 * `Coding`, `MedicationRequest.requester` is a `Reference`,
 * `DocumentReference.category` is `CodeableConcept[]`.
 *
 * `undefined` means "nothing conformant to write" — the caller drops the
 * element and reports it, rather than writing something R4 disallows.
 */

describe('toAnnotations — STU3 Observation.comment to R4 note (Annotation[])', () => {
  it('wraps a string as one Annotation', () => {
    expect(toAnnotations('Taken after fasting.')).toEqual([{ text: 'Taken after fasting.' }]);
  });

  it('keeps something already shaped like an Annotation', () => {
    expect(toAnnotations([{ text: 'a' }, { text: 'b' }])).toEqual([{ text: 'a' }, { text: 'b' }]);
  });

  it('wraps strings inside a list', () => {
    expect(toAnnotations(['a', { text: 'b' }])).toEqual([{ text: 'a' }, { text: 'b' }]);
  });

  it.each([[42], [true], [null]])('yields nothing for %s, which is no Annotation', (value) => {
    // Previously passed straight through, putting a bare scalar into a field
    // R4 types as Annotation[].
    expect(toAnnotations(value)).toBeUndefined();
  });

  it('yields nothing rather than an empty array', () => {
    // FHIR JSON does not allow an empty array.
    expect(toAnnotations([])).toBeUndefined();
    expect(toAnnotations([42, null])).toBeUndefined();
  });
});

describe('toReferenceList — STU3 Observation.related to R4 hasMember (Reference[])', () => {
  it('keeps the targets and drops the relationship type R4 cannot hold', () => {
    expect(
      toReferenceList([
        { type: 'has-member', target: { reference: 'Observation/a' } },
        { type: 'derived-from', target: { reference: 'Observation/b' } },
      ]),
    ).toEqual([{ reference: 'Observation/a' }, { reference: 'Observation/b' }]);
  });

  it('accepts a lone entry that is not in a list', () => {
    expect(toReferenceList({ target: { reference: 'Observation/a' } })).toEqual([
      { reference: 'Observation/a' },
    ]);
  });

  it('skips an entry with no target', () => {
    expect(toReferenceList([{ type: 'has-member' }, { target: { reference: 'x' } }])).toEqual([
      { reference: 'x' },
    ]);
  });

  it('skips a target that is not itself a Reference', () => {
    expect(toReferenceList([{ target: 'Observation/a' }])).toBeUndefined();
  });

  it('yields nothing rather than an empty array', () => {
    expect(toReferenceList(['nonsense', 42])).toBeUndefined();
    expect(toReferenceList([])).toBeUndefined();
  });
});

describe('toFirstCoding — R5 Encounter.class to R4 class (a single Coding)', () => {
  it('takes the first coding of the first concept', () => {
    expect(
      toFirstCoding([
        { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' }] },
        { coding: [{ code: 'IMP' }] },
      ]),
    ).toEqual({ system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' });
  });

  it('yields nothing for a concept carrying only text', () => {
    // R4 `Encounter.class` is a Coding, and Coding has no `text` element —
    // this used to emit `{ text: … }` into a field typed as Coding.
    expect(toFirstCoding([{ text: 'ambulatory' }])).toBeUndefined();
  });

  it('yields nothing for an empty coding array', () => {
    expect(toFirstCoding([{ coding: [] }])).toBeUndefined();
  });

  it.each([[['AMB']], [[42]], [[null]]])('yields nothing for %s', (value) => {
    expect(toFirstCoding(value)).toBeUndefined();
  });

  it('yields nothing when the coding entry is not an object', () => {
    expect(toFirstCoding([{ coding: ['AMB'] }])).toBeUndefined();
  });

  it('handles a lone concept that is not in a list', () => {
    // Unreachable through the table — the row's `applies` is `Array.isArray`,
    // which is what tells an R5 class list from an R4 Coding. Asserted anyway
    // so the converter is correct on its own terms.
    expect(toFirstCoding({ coding: [{ code: 'AMB' }] })).toEqual({ code: 'AMB' });
  });
});

describe('toRequesterReference — STU3 MedicationRequest.requester to R4 (a Reference)', () => {
  it('flattens the backbone to its agent', () => {
    expect(
      toRequesterReference({
        agent: { reference: 'Practitioner/p1' },
        onBehalfOf: { reference: 'Organization/o1' },
      }),
    ).toEqual({ reference: 'Practitioner/p1' });
  });

  it('yields nothing when there is no agent to flatten to', () => {
    // Guarded by the row's `applies` in practice; asserted so the converter is
    // safe on its own terms rather than only in the one place it is wired up.
    expect(toRequesterReference({ onBehalfOf: { reference: 'Organization/o1' } })).toBeUndefined();
    expect(toRequesterReference('Practitioner/p1')).toBeUndefined();
  });
});

describe('toMedicationChoice — R5 CodeableReference to the R4 medication[x] pair', () => {
  it('splits a concept onto medicationCodeableConcept', () => {
    expect(toMedicationChoice({ concept: { text: 'Amoxicillin' } })).toEqual({
      medicationCodeableConcept: { text: 'Amoxicillin' },
    });
  });

  it('splits a reference onto medicationReference', () => {
    expect(toMedicationChoice({ reference: { reference: 'Medication/m1' } })).toEqual({
      medicationReference: { reference: 'Medication/m1' },
    });
  });

  it('carries both when both are present', () => {
    expect(
      toMedicationChoice({ concept: { text: 'A' }, reference: { reference: 'Medication/m1' } }),
    ).toEqual({
      medicationCodeableConcept: { text: 'A' },
      medicationReference: { reference: 'Medication/m1' },
    });
  });

  it.each([['a string'], [42], [null]])('yields no fields for %s', (value) => {
    // R4 `medication[x]` is CodeableConcept or Reference; a scalar is neither.
    expect(toMedicationChoice(value)).toEqual({});
  });

  it('yields no fields when neither half is usable', () => {
    expect(toMedicationChoice({ concept: 'Amoxicillin' })).toEqual({});
    expect(toMedicationChoice({})).toEqual({});
  });
});

describe('toList — STU3 DocumentReference.class to R4 category (a list)', () => {
  it('wraps a single concept', () => {
    expect(toList({ text: 'Discharge summary' })).toEqual([{ text: 'Discharge summary' }]);
  });

  it('leaves a list alone', () => {
    expect(toList([{ text: 'a' }])).toEqual([{ text: 'a' }]);
  });

  it('yields nothing rather than an empty array', () => {
    expect(toList([])).toBeUndefined();
  });
});
