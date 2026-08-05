import { describe, expect, it } from 'vitest';
import { createCollectionBundle } from '../core';
import { resolveChoice } from './choice';
import { VALUE_KIND } from './constants';
import { simplifyBundle, simplifyResource } from './utils';

const observation = (extra: object) => ({
  resourceType: 'Observation',
  id: 'obs-1',
  status: 'final',
  code: { text: 'Body Weight' },
  ...extra,
});

describe('resolveChoice', () => {
  it.each([
    [
      'valueQuantity',
      { valueQuantity: { value: 74.5, unit: 'kg' } },
      VALUE_KIND.QUANTITY,
      '74.5 kg',
    ],
    [
      'valueCodeableConcept',
      { valueCodeableConcept: { text: 'Present' } },
      VALUE_KIND.CONCEPT,
      'Present',
    ],
    ['valueString', { valueString: 'looks fine' }, VALUE_KIND.STRING, 'looks fine'],
    ['valueBoolean', { valueBoolean: true }, VALUE_KIND.BOOLEAN, 'true'],
    ['valueInteger', { valueInteger: 5 }, VALUE_KIND.NUMBER, '5'],
    ['valueDecimal', { valueDecimal: 1.5 }, VALUE_KIND.NUMBER, '1.5'],
    ['valueDateTime', { valueDateTime: '2026-07-20' }, VALUE_KIND.DATE_TIME, '2026-07-20'],
    ['valuePeriod', { valuePeriod: { start: 'a', end: 'b' } }, VALUE_KIND.PERIOD, 'a → b'],
    [
      'valueReference',
      { valueReference: { reference: 'Patient/p1' } },
      VALUE_KIND.REFERENCE,
      'Patient/p1',
    ],
  ])('resolves %s onto one key with a kind and text', (_label, input, kind, text) => {
    const resolved = resolveChoice(input, 'value');

    expect(resolved?.value.kind).toBe(kind);
    expect(resolved?.value.text).toBe(text);
  });

  it('reports which element the value came from', () => {
    expect(resolveChoice({ valueString: 'x' }, 'value')?.sourceKey).toBe('valueString');
  });

  it('returns null when the choice is absent', () => {
    expect(resolveChoice({ status: 'final' }, 'value')).toBeNull();
  });

  it('does not mistake a same-prefixed element for a choice', () => {
    // `valueSet` is a field in its own right, not `value` of type `Set`.
    expect(resolveChoice({ valueSet: 'http://example.org/vs' }, 'value')).toBeNull();
  });

  it('rejects a type the element does not permit', () => {
    const permitted = ['Quantity', 'CodeableConcept', 'string'];

    expect(resolveChoice({ valueQuantity: { value: 1 } }, 'value', permitted)).not.toBeNull();
    expect(resolveChoice({ valueReference: { reference: 'X/1' } }, 'value', permitted)).toBeNull();
  });

  it('matches a primitive type whatever case the spec writes it in', () => {
    // The spec says `string` and `dateTime`; payloads say `valueString`.
    expect(resolveChoice({ valueString: 'x' }, 'value', ['string'])?.value.text).toBe('x');
    expect(resolveChoice({ valueDateTime: '2026-01-01' }, 'value', ['dateTime'])?.sourceKey).toBe(
      'valueDateTime',
    );
  });

  it('prefers a non-suffixed element of the same name', () => {
    expect(resolveChoice({ value: 'plain' }, 'value')?.sourceKey).toBe('value');
  });

  it('resolves choices other than value[x]', () => {
    expect(resolveChoice({ onsetDateTime: '2024-01-01' }, 'onset')?.value.kind).toBe(
      VALUE_KIND.DATE_TIME,
    );
    expect(resolveChoice({ effectivePeriod: { start: 'a' } }, 'effective')?.value.kind).toBe(
      VALUE_KIND.PERIOD,
    );
  });
});

describe('simplifyResource — the shape is predictable', () => {
  it('collapses every value[x] onto `value`', () => {
    const asQuantity = simplifyResource(observation({ valueQuantity: { value: 1, unit: 'kg' } }));
    const asString = simplifyResource(observation({ valueString: 'text' }));

    expect(Object.keys(asQuantity.fields)).toContain('value');
    expect(Object.keys(asString.fields)).toContain('value');
    expect(Object.keys(asQuantity.fields)).not.toContain('valueQuantity');
  });

  it('always provides a text rendering, whatever the kind', () => {
    for (const extra of [
      { valueQuantity: { value: 74.5, unit: 'kg' } },
      { valueCodeableConcept: { coding: [{ display: 'Present' }] } },
      { valueRange: { low: { value: 1, unit: 'x' }, high: { value: 2, unit: 'x' } } },
    ]) {
      const { fields } = simplifyResource(observation(extra));
      const value = fields.value;

      expect(Array.isArray(value)).toBe(false);
      expect(typeof (value as { text: string }).text).toBe('string');
      expect((value as { text: string }).text.length).toBeGreaterThan(0);
    }
  });

  it('reads Money, which carries currency where Quantity carries unit', () => {
    const { fields } = simplifyResource({
      resourceType: 'PaymentNotice',
      status: 'active',
      amount: { value: 1000, currency: 'USD' },
    });

    // Without this the financial resources render a bare `1000`.
    expect(fields.amount).toMatchObject({ text: '1000 USD', value: 1000, unit: 'USD' });
  });

  it('leaves a clinical Quantity alone', () => {
    const { fields } = simplifyResource(
      observation({ valueQuantity: { value: 74.5, unit: 'kg', code: 'kg' } }),
    );

    expect(fields.value).toMatchObject({ text: '74.5 kg', unit: 'kg', code: 'kg' });
  });

  it('labels a resource whose name lives inside a backbone element', () => {
    // MedicinalProductDefinition has no top-level name, so a label built only
    // from top-level fields would read as a bare status code.
    const { display } = simplifyResource({
      resourceType: 'MedicinalProductDefinition',
      id: 'm1',
      status: { text: 'active' },
      name: [{ productName: 'Amoxil 500mg' }],
    });

    expect(display).toBe('Amoxil 500mg · active');
  });

  it('splits a reference into its resource type and id', () => {
    const { fields } = simplifyResource(observation({ subject: { reference: 'Patient/pat-1' } }));

    expect(fields.subject).toMatchObject({
      kind: VALUE_KIND.REFERENCE,
      reference: 'Patient/pat-1',
      resourceType: 'Patient',
      id: 'pat-1',
    });
  });

  it('reads a CodeableConcept and a bare Coding into the same shape', () => {
    const fromConcept = simplifyResource({
      resourceType: 'Encounter',
      class: { coding: [{ code: 'AMB', display: 'ambulatory' }] },
    });
    const fromCoding = simplifyResource({
      resourceType: 'Encounter',
      class: { code: 'AMB', display: 'ambulatory' },
    });

    expect(fromConcept.fields.class).toMatchObject({ code: 'AMB', display: 'ambulatory' });
    expect(fromCoding.fields.class).toMatchObject({ code: 'AMB', display: 'ambulatory' });
  });

  it('always returns a list for a repeating element, even with one item', () => {
    const { fields } = simplifyResource({
      resourceType: 'Patient',
      name: { family: 'Khan', given: ['Ali'] },
    });

    expect(Array.isArray(fields.name)).toBe(true);
    expect((fields.name as { text: string }[])[0]?.text).toBe('Ali Khan');
  });

  it('keeps backbone elements structured rather than flattening them away', () => {
    const { fields } = simplifyResource(
      observation({
        component: [
          { code: { text: 'Systolic' }, valueQuantity: { value: 118, unit: 'mmHg' } },
          { code: { text: 'Diastolic' }, valueQuantity: { value: 76, unit: 'mmHg' } },
        ],
      }),
    );
    const [systolic] = fields.component as unknown as {
      code: { text: string };
      value: { text: string };
    }[];

    expect(fields.component).toHaveLength(2);
    expect(systolic?.code.text).toBe('Systolic');
    expect(systolic?.value.text).toBe('118 mmHg');
  });

  it('builds a one-line display for the resource', () => {
    expect(
      simplifyResource(observation({ valueQuantity: { value: 74.5, unit: 'kg' } })).display,
    ).toBe('Body Weight · 74.5 kg');
  });

  it('falls back to the id, then the resource type, when there is nothing to label with', () => {
    expect(simplifyResource({ resourceType: 'Basic', id: 'b1' }).display).toBe('b1');
    expect(simplifyResource({ resourceType: 'Basic' }).display).toBe('Basic');
  });
});

describe('simplifyResource — nothing disappears quietly', () => {
  it('lists elements the shape does not declare', () => {
    const { unmapped } = simplifyResource({
      resourceType: 'Patient',
      name: [{ family: 'Khan' }],
      acmeInternalScore: 42,
    });

    expect(unmapped).toEqual(['acmeInternalScore']);
  });

  it('does not report common plumbing as unmapped', () => {
    const { unmapped } = simplifyResource({
      resourceType: 'Patient',
      meta: { versionId: '1' },
      text: { status: 'generated', div: '<p/>' },
      extension: [{ url: 'http://x' }],
    });

    expect(unmapped).toEqual([]);
  });

  it.each([
    ['Consent', 'sourceIdentifier', 'source'],
    ['Observation', 'valueReference', 'value'],
    ['Condition', 'abatementBoolean', 'abatement'],
    ['MessageHeader', 'eventCanonical', 'event'],
    ['PlanDefinition', 'subjectCanonical', 'subject'],
  ])(
    'reports %s.%s as unmapped rather than reading it as R4 "%s"',
    (resourceType, sourceKey, base) => {
      // These come from STU3 or R5, where the element permits a type R4 does
      // not. Resolving on the suffix alone would present them as conformant.
      const { fields, unmapped } = simplifyResource({
        resourceType,
        [sourceKey]: { reference: 'X/1', value: 'v', display: 'd' },
      });

      expect(Object.keys(fields)).not.toContain(base);
      expect(unmapped).toContain(sourceKey);
    },
  );

  it('still resolves choices for a resource type with no declared shape', () => {
    const { fields, resourceType } = simplifyResource({
      resourceType: 'RiskAssessment',
      status: 'final',
    });

    expect(resourceType).toBe('RiskAssessment');
    expect(fields.status).toMatchObject({ kind: VALUE_KIND.STRING, text: 'final' });
  });

  it('handles a resource with no resourceType without throwing', () => {
    expect(simplifyResource({ name: 'Ali' }).resourceType).toBe('Unknown');
  });
});

describe('simplifyBundle', () => {
  it('simplifies every entry in order', () => {
    const bundle = createCollectionBundle([
      { resourceType: 'Patient', id: 'p1', name: [{ family: 'Khan' }] } as never,
      observation({ valueQuantity: { value: 74.5, unit: 'kg' } }) as never,
    ]);

    expect(simplifyBundle(bundle).map((r) => r.resourceType)).toEqual(['Patient', 'Observation']);
  });

  it('returns an empty list for a bundle with no entries', () => {
    expect(simplifyBundle({ resourceType: 'Bundle', type: 'collection' })).toEqual([]);
  });

  it('leaves the canonical bundle untouched', () => {
    const bundle = createCollectionBundle([
      observation({ valueQuantity: { value: 1, unit: 'kg' } }) as never,
    ]);
    const before = JSON.stringify(bundle);

    simplifyBundle(bundle);

    expect(JSON.stringify(bundle)).toBe(before);
  });
});
