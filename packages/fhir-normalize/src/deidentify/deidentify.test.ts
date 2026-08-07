import type { Bundle } from 'fhir/r4';
import { describe, expect, it } from 'vitest';
import { DATE_POLICY, FREE_TEXT_POLICY } from './constants';
import { surrogate, surrogateReference } from './surrogate';
import { deIdentifyBundle, deIdentifyResource } from './utils';

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

describe('deIdentifyResource', () => {
  const patient = () => ({
    resourceType: 'Patient' as const,
    id: 'pat-1',
    identifier: [{ system: 'http://hospital.example/mrn', value: 'MRN-417' }],
    name: [{ family: 'Khan', given: ['Ali'] }],
    birthDate: '1984-03-12',
    telecom: [{ system: 'phone' as const, value: '+92-300-1234567' }],
  });

  it('scrubs a bare resource the same way it would inside a Bundle', () => {
    // The asymmetry this closes: callers holding one resource had to wrap it
    // in a Bundle and unwrap the result. Both paths must agree exactly.
    const viaResource = deIdentifyResource(patient());
    const viaBundle = deIdentifyBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: patient() }],
    } as Bundle);

    expect(viaResource.resource).toEqual(viaBundle.bundle.entry?.[0]?.resource);
  });

  it('reports on the one resource it was given', () => {
    const { report } = deIdentifyResource(patient());

    expect(report.redacted).toBeGreaterThan(0);
    expect(report.elements).toContain('name');
  });

  it('leaves the input untouched', () => {
    const input = patient();
    const before = JSON.stringify(input);

    deIdentifyResource(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it('honours the same options as the Bundle pass', () => {
    const { resource } = deIdentifyResource(patient(), {
      dates: DATE_POLICY.YEAR,
      keep: ['birthDate'],
    });

    expect(resource).toMatchObject({ birthDate: '1984-03-12' });
  });

  it('pseudonymizes ids consistently with the Bundle pass', () => {
    const { resource } = deIdentifyResource(patient(), { salt: 'fixed' });

    expect(resource.id).toBe(surrogate('pat-1', 'fixed'));
  });
});

describe('an identifier is removed in every form it takes', () => {
  const scrub = (resource: object) =>
    deIdentifyResource(resource as never).resource as unknown as Record<string, unknown>;

  it('removes the coordinates as well as the address', () => {
    // Latitude and longitude fix a building to about ten metres — more
    // precisely than the address the same pass deletes.
    expect(
      scrub({ resourceType: 'Location', position: { latitude: 42.3601, longitude: -71.0589 } }),
    ).toEqual({ resourceType: 'Location' });
  });

  it('removes the UDI as well as the serial number', () => {
    // `(21)` is the AIDC application identifier for the serial number, so the
    // carrier repeats what `serialNumber` already gave up.
    expect(
      scrub({
        resourceType: 'Device',
        serialNumber: 'SN-99',
        udiCarrier: [{ deviceIdentifier: '0847', carrierHRF: '(01)0084(21)SN-99' }],
      }),
    ).toEqual({ resourceType: 'Device' });
  });

  it('removes an embedded document, which is prose that happens to be encoded', () => {
    const scrubbed = scrub({
      resourceType: 'Binary',
      contentType: 'application/pdf',
      // Decodes to "%PDF-1.4\n% Sara Ahmed".
      data: 'JVBERi0xLjQKJSBTYXJhIEFobWVk',
    });

    expect(scrubbed.data).toBeUndefined();
    expect(scrubbed.contentType).toBe('application/pdf');
  });

  it('removes an attachment title, which labels the document with its subject', () => {
    const scrubbed = scrub({
      resourceType: 'DocumentReference',
      content: [
        { attachment: { contentType: 'application/pdf', title: 'Referral for Sara Ahmed' } },
      ],
    });

    expect(scrubbed).toEqual({
      resourceType: 'DocumentReference',
      content: [{ attachment: { contentType: 'application/pdf' } }],
    });
  });

  it('reports what it removed under a name that says where it was', () => {
    const { report } = deIdentifyResource({
      resourceType: 'Binary',
      contentType: 'text/plain',
      data: 'U2FyYQ==',
    } as never);

    expect(report.elements).toContain('Attachment.data');
  });
});

describe('the new rules do not take what they should leave', () => {
  const scrub = (resource: object) =>
    deIdentifyResource(resource as never).resource as unknown as Record<string, unknown>;

  it('keeps an artefact title, which is not a document label', () => {
    // `title` is on 33 R4 resources as the name of the thing itself. Only an
    // Attachment's `title` describes content, which is why the rule is
    // contextual rather than a name in the redact list.
    expect(
      scrub({ resourceType: 'ValueSet', url: 'http://example.org/vs', title: 'Body Weight Codes' }),
    ).toMatchObject({ title: 'Body Weight Codes' });
  });

  it('keeps Consent.provision.data, which shares the name but is a backbone', () => {
    const scrubbed = scrub({
      resourceType: 'Consent',
      provision: {
        data: [{ meaning: 'instance', reference: { reference: 'DocumentReference/d1' } }],
      },
    });
    const provision = scrubbed.provision as { data: { meaning: string }[] };

    expect(provision.data).toHaveLength(1);
    expect(provision.data[0]?.meaning).toBe('instance');
  });
});
