import { describe, expect, it } from 'vitest';
import { createDefaultNormalizer } from '../..';
import { validateBundle } from '../../validate';
import { fhirXmlParser } from './index';

/**
 * FHIR XML carries no schema, so a lone `<jurisdiction>` is indistinguishable
 * from a one-item list and the parser has to decide.
 *
 * It used to decide from thirty hand-written names, out of the 483 R4 makes
 * `0..*`, and to treat any element called `resource` or `outcome` as a wrapper
 * around a nested resource. Both are now read from the spec digest, per
 * resource type, because the answer is not a property of the name alone.
 */

const parse = (xml: string) => {
  const { bundle } = createDefaultNormalizer().register(fhirXmlParser).parse(xml);
  return bundle.entry?.[0]?.resource as unknown as Record<string, unknown>;
};

describe('cardinality comes from the specification', () => {
  it('arrays a repeating element that was never on the hand-written list', () => {
    // 460 of 483 repeating names were missing, `jurisdiction` among them.
    const resource = parse(
      '<ValueSet><status value="active"/><jurisdiction><coding><code value="US"/></coding></jurisdiction></ValueSet>',
    );

    expect(Array.isArray(resource.jurisdiction)).toBe(true);
  });

  it.each([
    ['ValueSet', 'useContext', '<useContext><code><code value="focus"/></code></useContext>'],
    ['Composition', 'author', '<author><reference value="Practitioner/p1"/></author>'],
    ['Appointment', 'reasonCode', '<reasonCode><text value="Checkup"/></reasonCode>'],
  ])('arrays %s.%s', (resourceType, element, xml) => {
    expect(Array.isArray(parse(`<${resourceType}>${xml}</${resourceType}>`)[element])).toBe(true);
  });

  it('keeps a name scalar on the resources where R4 says 0..1', () => {
    // `author` repeats on Composition and does not on CarePlan. Written the
    // other way round first, and the spec-derived parser was right.
    expect(
      parse(
        '<CarePlan><status value="active"/><author><reference value="Practitioner/p"/></author></CarePlan>',
      ).author,
    ).toEqual({ reference: 'Practitioner/p' });
  });

  it('keeps the same name scalar where R4 says 0..1', () => {
    // The case the old heuristic guessed at by looking at the value type:
    // `Patient.name` is a repeating HumanName, `Organization.name` a string.
    expect(
      Array.isArray(parse('<Patient><name><family value="Ahmed"/></name></Patient>').name),
    ).toBe(true);
    expect(parse('<Organization><name value="St Marys"/></Organization>').name).toBe('St Marys');
  });

  it('still arrays the elements every resource inherits', () => {
    // Absent from the digest, which leaves inherited elements out, so the
    // table would otherwise answer "no" for them.
    const resource = parse(
      '<Patient><extension url="http://example.org/x"><valueInteger value="42"/></extension></Patient>',
    );

    expect(Array.isArray(resource.extension)).toBe(true);
  });

  it('agrees with the validator across every resource type', () => {
    // The parser and the validator read the same digest, so XML built from one
    // repeating element of each kind should produce no cardinality complaints.
    const normalizer = createDefaultNormalizer().register(fhirXmlParser);
    const xml =
      '<Observation><category><text value="vital"/></category>' +
      '<performer><reference value="Practitioner/p"/></performer>' +
      '<note><text value="n"/></note><status value="final"/></Observation>';

    const { bundle } = normalizer.parse(xml);

    expect(validateBundle(bundle).filter((i) => i.code === 'expected-list')).toEqual([]);
  });
});

describe('only a real resource container wraps a nested resource', () => {
  it.each([
    [
      'Procedure.outcome, a CodeableConcept',
      '<Procedure><status value="completed"/><outcome><text value="Successful"/></outcome></Procedure>',
      'outcome',
      { text: 'Successful' },
    ],
    ['AuditEvent.outcome, a code', '<AuditEvent><outcome value="0"/></AuditEvent>', 'outcome', '0'],
  ])('reads %s as itself, not as a resource', (_label, xml, element, expected) => {
    // Matching the name alone turned `Procedure.outcome` into
    // `{ resourceType: 'text' }` and made `AuditEvent.outcome` vanish.
    expect(parse(xml)[element]).toEqual(expected);
  });

  it('reads CompartmentDefinition.resource as the backbone list it is', () => {
    expect(
      parse(
        '<CompartmentDefinition><resource><code value="Patient"/></resource></CompartmentDefinition>',
      ).resource,
    ).toEqual([{ code: 'Patient' }]);
  });

  it('still unwraps the two places FHIR really nests a resource', () => {
    const { bundle } = createDefaultNormalizer()
      .register(fhirXmlParser)
      .parse(
        '<Bundle><type value="collection"/><entry><resource><Patient><id value="p"/></Patient></resource></entry></Bundle>',
      );

    expect(bundle.entry?.[0]?.resource).toMatchObject({ resourceType: 'Patient', id: 'p' });
  });

  it('still unwraps contained resources, which are inherited', () => {
    expect(
      parse(
        '<Patient><contained><Practitioner><id value="pr"/></Practitioner></contained></Patient>',
      ).contained,
    ).toEqual([{ resourceType: 'Practitioner', id: 'pr' }]);
  });
});
