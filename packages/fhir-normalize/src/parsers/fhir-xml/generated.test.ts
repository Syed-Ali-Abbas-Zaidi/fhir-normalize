import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RESOURCE_CONTAINER_AT } from './cardinality.generated';

const GENERATED = new URL('./cardinality.generated.ts', import.meta.url);

/**
 * The parser decides cardinality from this file, so a stale copy means XML
 * comes out shaped wrong — silently, since XML has no schema to contradict it.
 */
describe('the generated cardinality table matches the spec digest', () => {
  it('is byte-identical to a fresh run of the generator', () => {
    const before = readFileSync(GENERATED, 'utf8');

    execFileSync('node', ['scripts/generate-xml-cardinality.mjs'], {
      cwd: fileURLToPath(new URL('../../..', import.meta.url)),
      stdio: 'ignore',
    });

    expect(readFileSync(GENERATED, 'utf8')).toBe(before);
  });

  it('finds only the two positions R4 types as a nested Resource', () => {
    // A guard on the rule itself: if this list ever grows by name-matching
    // rather than by type, the eighteen `outcome` elements break again.
    expect(RESOURCE_CONTAINER_AT).toEqual([
      'Bundle.entry.resource',
      'Parameters.parameter.resource',
    ]);
  });
});
