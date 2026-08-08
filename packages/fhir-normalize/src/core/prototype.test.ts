import { describe, expect, it } from 'vitest';
import { deIdentifyBundle, deIdentifyResource } from '../deidentify';
import { createDefaultNormalizer } from '../index';
import { fhirXmlParser } from '../parsers/fhir-xml';
import { simplifyResource } from '../simplified';
import { ParseError } from './errors';

/**
 * Input here is FHIR from other systems, so a key can be anything, including
 * `__proto__`.
 *
 * That name is an accessor on `Object.prototype`, not an ordinary property, so
 * `record[key] = value` replaces the target's prototype instead of adding a
 * key. The object then answers to whatever the payload chose while
 * `Object.keys` shows nothing, which is a confusing thing to hand a caller
 * whatever else it is.
 *
 * The parsers were always safe because they build with object spread, which
 * creates an own property. Anything assembling a record key by key was not.
 */

/** Fresh each time: one polluted result would otherwise mask the next. */
const hostile = () =>
  JSON.parse('{"resourceType":"Patient","id":"p1","__proto__":{"isAdmin":true}}');

const prototypeIntact = (value: object) => Object.getPrototypeOf(value) === Object.prototype;

describe('a `__proto__` key cannot reach an object prototype', () => {
  it('leaves Object.prototype alone', () => {
    createDefaultNormalizer().parse(hostile());
    deIdentifyResource(hostile());
    simplifyResource(hostile());

    expect(({} as { isAdmin?: unknown }).isAdmin).toBeUndefined();
  });

  it('returns a parsed resource with its own prototype', () => {
    const { bundle } = createDefaultNormalizer().parse(hostile());

    expect(prototypeIntact(bundle.entry?.[0]?.resource as object)).toBe(true);
  });

  it('returns a de-identified resource with its own prototype', () => {
    const { resource } = deIdentifyResource(hostile());

    expect(prototypeIntact(resource)).toBe(true);
    expect((resource as { isAdmin?: unknown }).isAdmin).toBeUndefined();
  });

  it('returns a de-identified bundle whose entries have their own prototype', () => {
    const { bundle } = deIdentifyBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: hostile() }],
    } as never);

    expect(prototypeIntact(bundle.entry?.[0]?.resource as object)).toBe(true);
  });

  it('returns simplified fields with their own prototype', () => {
    const { fields } = simplifyResource(hostile());

    expect(prototypeIntact(fields)).toBe(true);
  });

  it('keeps the value as an ordinary own property rather than dropping it', () => {
    // Consistent with the rest of the library: an element it does not
    // understand is still read and reported, never silently discarded.
    const { fields, unmapped } = simplifyResource(hostile());

    expect(Object.keys(fields)).toContain('__proto__');
    expect(unmapped).toContain('__proto__');
  });
});

describe('the XML adapter reports a rejected document as a ParseError', () => {
  it('wraps what the underlying parser throws', () => {
    // fast-xml-parser refuses an element named `__proto__` on security
    // grounds, and does so after its own validator has passed the document.
    // Unwrapped that surfaces as a bare Error, though every other failure in
    // this adapter is a ParseError.
    const parse = () =>
      createDefaultNormalizer()
        .register(fhirXmlParser)
        .parse('<Patient><__proto__><isAdmin value="true"/></__proto__></Patient>');

    expect(parse).toThrow(ParseError);
  });
});
