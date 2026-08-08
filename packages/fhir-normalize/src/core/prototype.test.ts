import { describe, expect, it } from 'vitest';
import { deIdentifyBundle, deIdentifyResource } from '../deidentify';
import { createDefaultNormalizer } from '../index';
import { fhirXmlParser } from '../parsers/fhir-xml';
import { simplifyResource } from '../simplified';
import { SOURCE_FORMAT } from './constants';
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

/**
 * Checked alongside every prototype assertion, because on its own
 * `prototypeIntact` cannot tell a fix from a different bug: dropping the key
 * entirely also leaves a plain object behind. The library's promise is that
 * nothing is discarded silently, so the value has to still be there, as an
 * ordinary own property.
 */
const keptAsOwnKey = (value: object) => Object.hasOwn(value, '__proto__');

describe('a `__proto__` key cannot reach an object prototype', () => {
  it('leaves Object.prototype alone', () => {
    createDefaultNormalizer().parse(hostile());
    deIdentifyResource(hostile());
    simplifyResource(hostile());

    expect(({} as { isAdmin?: unknown }).isAdmin).toBeUndefined();
  });

  it('returns a parsed resource with its own prototype, key intact', () => {
    const { bundle } = createDefaultNormalizer().parse(hostile());
    const resource = bundle.entry?.[0]?.resource as object;

    expect(prototypeIntact(resource)).toBe(true);
    expect(keptAsOwnKey(resource)).toBe(true);
  });

  it('returns a de-identified resource with its own prototype, key intact', () => {
    const { resource } = deIdentifyResource(hostile());

    expect(prototypeIntact(resource)).toBe(true);
    expect(keptAsOwnKey(resource)).toBe(true);
    expect((resource as { isAdmin?: unknown }).isAdmin).toBeUndefined();
  });

  it('returns a de-identified bundle whose entries have their own prototype, key intact', () => {
    const { bundle } = deIdentifyBundle({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{ resource: hostile() }],
    } as never);
    const resource = bundle.entry?.[0]?.resource as object;

    expect(prototypeIntact(resource)).toBe(true);
    expect(keptAsOwnKey(resource)).toBe(true);
  });

  it('returns simplified fields with their own prototype, key intact', () => {
    const { fields } = simplifyResource(hostile());

    expect(prototypeIntact(fields)).toBe(true);
    expect(keptAsOwnKey(fields)).toBe(true);
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

    // The class alone is not the point. Wrapping is only useful if what the
    // dependency said survives, so a caller can see why the document was
    // refused rather than just that it was.
    const error = (() => {
      try {
        parse();
      } catch (thrown) {
        return thrown as ParseError;
      }
      throw new Error('expected a ParseError');
    })();

    expect(error.format).toBe(SOURCE_FORMAT.FHIR_XML);
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toContain('__proto__');
  });
});
