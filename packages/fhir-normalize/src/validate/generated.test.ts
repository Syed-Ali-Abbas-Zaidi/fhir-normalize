import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FHIR_TYPE_NAMES, R4_INDEX } from './r4-index.generated';

const GENERATED = new URL('./r4-index.generated.ts', import.meta.url);

/**
 * `r4-index.generated.ts` is what the validator judges payloads against, so a
 * stale copy means the validator is confidently wrong about R4. It is derived
 * from `spec/r4-elements.json`; nothing stops someone regenerating the digest
 * and forgetting this, which is exactly the drift the spec digests exist to
 * prevent, one level up.
 */
describe('the generated R4 index matches the spec digest', () => {
  it('is byte-identical to a fresh run of the generator', () => {
    const before = readFileSync(GENERATED, 'utf8');

    execFileSync('node', ['scripts/generate-validate-index.mjs'], {
      cwd: new URL('../..', import.meta.url).pathname,
      stdio: 'ignore',
    });

    expect(readFileSync(GENERATED, 'utf8')).toBe(before);
  });

  it('covers every resource the digest describes', () => {
    const digest = JSON.parse(
      readFileSync(new URL('../../spec/r4-elements.json', import.meta.url), 'utf8'),
    );

    expect(Object.keys(R4_INDEX).sort()).toEqual(Object.keys(digest).sort());
  });

  it('carries the datatype names the choice check depends on', () => {
    // Lowercased, because the spec writes `string` where a payload writes
    // `valueString`. Without these every disallowed choice type would be
    // reported as a plain unknown element.
    for (const type of ['quantity', 'codeableconcept', 'reference', 'string', 'period']) {
      expect(FHIR_TYPE_NAMES.has(type)).toBe(true);
    }
  });
});
