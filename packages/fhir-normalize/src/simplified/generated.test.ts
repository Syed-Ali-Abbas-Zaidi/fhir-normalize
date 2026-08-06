import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RESOURCE_SHAPE } from './shapes';

const GENERATED = new URL('./fields.generated.ts', import.meta.url);

/**
 * `fields.generated.ts` is derived from the shape tables. Nothing stops someone
 * editing a table and not regenerating, and the result would be a type that
 * quietly disagrees with what the code returns — the exact failure mode the
 * spec digests exist to prevent, one level up.
 */
describe('the generated field types match the shape tables', () => {
  it('declares an interface for every shape, and no others', () => {
    const source = readFileSync(GENERATED, 'utf8');
    const declared = [...source.matchAll(/^export interface (\w+)Fields\b/gm)].map((m) => m[1]);

    expect(declared.sort()).toEqual(Object.keys(RESOURCE_SHAPE).sort());
  });

  it('is byte-identical to a fresh run of the generator', () => {
    const before = readFileSync(GENERATED, 'utf8');

    // Writes the same path, so a mismatch means the committed file is stale.
    execFileSync('node', ['scripts/generate-field-types.mjs'], {
      cwd: new URL('../..', import.meta.url).pathname,
      stdio: 'ignore',
    });

    expect(readFileSync(GENERATED, 'utf8')).toBe(before);
  });
});
