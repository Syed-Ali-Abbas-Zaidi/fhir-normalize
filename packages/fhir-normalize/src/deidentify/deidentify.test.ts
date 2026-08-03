import type { Bundle } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { DATE_POLICY, FREE_TEXT_POLICY } from './constants';
import { surrogate, surrogateReference } from './surrogate';
import { deIdentifyBundle } from './utils';

const patientBundle = (): Bundle =>
  ({
    resourceType: 'Bundle',
    type: 'collection',
    entry: [
      {
        fullUrl: 'urn:uuid:abc',
        resource: {
          resourceType: 'Patient',
          id: 'pat-1',
          identifier: [{ system: 'http://hospital/mrn', value: 'MRN-00417' }],
          name: [{ family: 'Khan', given: ['Ali'] }],
          telecom: [{ system: 'email', value: 'ali@example.com' }],
          address: [{ line: ['12 Jail Road'], city: 'Lahore', postalCode: '54000' }],
          gender: 'male',
          birthDate: '1996-04-12',
          text: { status: 'generated', div: '<div>Ali Khan, born 12 Apr 1996</div>' },
        },
      },
      {
        resource: {
          resourceType: 'Observation',
          id: 'obs-1',
          status: 'final',
          code: {
            text: 'Body Weight',
            coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body Weight' }],
          },
          subject: { reference: 'Patient/pat-1', display: 'Ali Khan' },
          effectiveDateTime: '2026-07-20T09:30:00Z',
          valueQuantity: { value: 74.5, unit: 'kg' },
          note: [{ text: 'Discussed with Ali and his father Ahmed.' }],
        },
      },
    ],
  }) as unknown as Bundle;

const json = (bundle: Bundle): string => JSON.stringify(bundle);

/** The resource at an entry index, as a loose record for assertion. */
const resourceAt = (bundle: Bundle, index: number): Record<string, unknown> =>
  (bundle.entry?.[index]?.resource ?? {}) as unknown as Record<string, unknown>;

describe('deIdentifyBundle — direct identifiers', () => {
  const { bundle } = deIdentifyBundle(patientBundle());
  const text = json(bundle);

  it.each([
    ['family name', 'Khan'],
    ['given name', 'Ali'],
    ['email', 'ali@example.com'],
    ['street', 'Jail Road'],
    ['city', 'Lahore'],
    ['postal code', '54000'],
    ['medical record number', 'MRN-00417'],
  ])('removes the %s', (_label, value) => {
    expect(text).not.toContain(value);
  });

  it('removes the rendered narrative, which repeats the whole identity', () => {
    expect(text).not.toContain('born 12 Apr');
    expect(text).not.toContain('<div>');
  });

  it('removes free text, which names people no structural rule can find', () => {
    expect(text).not.toContain('Ahmed');
  });
});

describe('deIdentifyBundle — keeps what is clinically useful', () => {
  const { bundle } = deIdentifyBundle(patientBundle());
  const text = json(bundle);

  it.each([
    ['the LOINC code', '29463-7'],
    ['the measurement', '74.5'],
    ['the unit', 'kg'],
    ['the status', 'final'],
    ['the gender', 'male'],
  ])('keeps %s', (_label, value) => {
    expect(text).toContain(value);
  });

  it('keeps Coding.display, which is vocabulary rather than a person', () => {
    expect(text).toContain('Body Weight');
  });

  it('removes Reference.display, which usually is a person', () => {
    const subject = resourceAt(bundle, 1).subject as Record<string, unknown>;

    expect(subject.display).toBeUndefined();
    expect(subject.reference).toBeDefined();
  });
});

describe('deIdentifyBundle — the graph survives', () => {
  it('gives a resource and every reference to it the same surrogate', () => {
    const { bundle } = deIdentifyBundle(patientBundle());
    const patientId = resourceAt(bundle, 0).id as string;
    const { reference } = resourceAt(bundle, 1).subject as { reference: string };

    expect(patientId).not.toBe('pat-1');
    expect(reference).toBe(`Patient/${patientId}`);
  });

  it('keeps the resource type on a reference, so it stays navigable', () => {
    expect(surrogateReference('Patient/pat-1', '')).toMatch(/^Patient\//);
  });

  it('drops ids instead of replacing them when pseudonymisation is off', () => {
    const { bundle } = deIdentifyBundle(patientBundle(), { pseudonymizeIds: false });
    expect(resourceAt(bundle, 0).id).toBeUndefined();
  });
});

describe('deIdentifyBundle — dates', () => {
  it('reduces a date to its year by default', () => {
    const { bundle } = deIdentifyBundle(patientBundle());
    expect(resourceAt(bundle, 0).birthDate).toBe('1996');
  });

  it('reduces a dateTime to its year too', () => {
    const { bundle } = deIdentifyBundle(patientBundle());
    expect(resourceAt(bundle, 1).effectiveDateTime).toBe('2026');
  });

  it('removes dates entirely when asked', () => {
    const { bundle } = deIdentifyBundle(patientBundle(), { dates: DATE_POLICY.REDACT });

    expect(json(bundle)).not.toContain('1996');
  });

  it('leaves dates alone when asked', () => {
    const { bundle } = deIdentifyBundle(patientBundle(), { dates: DATE_POLICY.KEEP });

    expect(json(bundle)).toContain('1996-04-12');
  });

  it('does not mistake a numeric measurement for a date', () => {
    const { bundle } = deIdentifyBundle(patientBundle());

    expect(json(bundle)).toContain('74.5');
  });
});

describe('deIdentifyBundle — options', () => {
  it('keeps free text on request', () => {
    const { bundle } = deIdentifyBundle(patientBundle(), {
      freeText: FREE_TEXT_POLICY.KEEP,
    });

    expect(json(bundle)).toContain('Ahmed');
  });

  it('honours an explicit keep list over the default policy', () => {
    const { bundle } = deIdentifyBundle(patientBundle(), { keep: ['name'] });

    expect(json(bundle)).toContain('Khan');
  });

  it('produces different surrogates under different salts, so datasets cannot be joined', () => {
    const first = deIdentifyBundle(patientBundle(), { salt: 'one' });
    const second = deIdentifyBundle(patientBundle(), { salt: 'two' });

    expect(json(first.bundle)).not.toBe(json(second.bundle));
  });

  it('produces identical output for the same input and salt', () => {
    const first = deIdentifyBundle(patientBundle(), { salt: 'same' });
    const second = deIdentifyBundle(patientBundle(), { salt: 'same' });

    expect(json(first.bundle)).toBe(json(second.bundle));
  });
});

describe('deIdentifyBundle — reporting and purity', () => {
  it('counts what it changed and names the elements', () => {
    const { report } = deIdentifyBundle(patientBundle());

    expect(report.redacted).toBeGreaterThan(0);
    expect(report.pseudonymized).toBeGreaterThan(0);
    expect(report.datesGeneralized).toBe(2);
    expect(report.elements).toContain('name');
    expect(report.elements).toContain('Reference.display');
    expect([...report.elements].sort()).toEqual(report.elements);
  });

  it('does not modify the input bundle', () => {
    const input = patientBundle();
    const before = json(input);

    deIdentifyBundle(input);

    expect(json(input)).toBe(before);
  });

  it('handles a bundle with no entries', () => {
    const empty = { resourceType: 'Bundle', type: 'collection' } as Bundle;

    expect(() => deIdentifyBundle(empty)).not.toThrow();
  });
});

describe('surrogate', () => {
  it('is stable for the same input and salt', () => {
    expect(surrogate('pat-1', 'salt')).toBe(surrogate('pat-1', 'salt'));
  });

  it('differs across salts', () => {
    expect(surrogate('pat-1', 'a')).not.toBe(surrogate('pat-1', 'b'));
  });

  it('differs across inputs', () => {
    expect(surrogate('pat-1', 's')).not.toBe(surrogate('pat-2', 's'));
  });

  it('does not leak the input', () => {
    expect(surrogate('MRN-00417', 's')).not.toContain('00417');
  });

  it('has no collisions across a large id space', () => {
    const ids = Array.from({ length: 5000 }, (_, index) => `patient-${index}`);
    const seen = new Set(ids.map((id) => surrogate(id, 'salt')));

    expect(seen.size).toBe(ids.length);
  });
});
