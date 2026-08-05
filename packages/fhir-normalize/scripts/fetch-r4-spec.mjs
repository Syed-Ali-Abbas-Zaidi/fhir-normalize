#!/usr/bin/env node
/**
 * Regenerates `spec/r4-elements.json` — the digest the shape conformance test
 * checks against.
 *
 * The digest is committed so the test suite stays offline and deterministic;
 * this script only needs running when the R4 definitions themselves change,
 * which for a frozen release is never. It exists so the digest's provenance is
 * reproducible rather than asserted.
 *
 *   node scripts/fetch-r4-spec.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SOURCE = 'http://hl7.org/fhir/R4/definitions.json.zip';
const OUTPUT = new URL('../spec/r4-elements.json', import.meta.url);

/** Inherited from Resource/DomainResource — not part of any resource proper. */
const INHERITED = new Set([
  'id',
  'meta',
  'implicitRules',
  'language',
  'text',
  'contained',
  'extension',
  'modifierExtension',
]);

const work = mkdtempSync(join(tmpdir(), 'fhir-r4-'));

try {
  const archive = join(work, 'definitions.json.zip');

  // curl over fetch: the definitions are ~9MB zipped and a truncated download
  // produces a digest that is silently short rather than an error.
  execFileSync('curl', ['-sSL', '--fail', '--retry', '3', '-o', archive, SOURCE]);
  execFileSync('unzip', ['-t', archive], { stdio: 'ignore' });
  execFileSync('unzip', ['-o', '-q', '-d', work, archive, 'profiles-resources.json']);

  const bundle = JSON.parse(readFileSync(join(work, 'profiles-resources.json'), 'utf8'));

  const definitions = (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter(
      (resource) =>
        resource?.resourceType === 'StructureDefinition' &&
        resource.kind === 'resource' &&
        resource.derivation !== 'constraint' &&
        resource.abstract !== true,
    );

  const digest = {};

  for (const definition of definitions.sort((a, b) => a.name.localeCompare(b.name))) {
    const fields = {};

    for (const element of definition.snapshot?.element ?? []) {
      const parts = element.path.split('.');

      // Top-level elements, plus one level inside a backbone so a generated
      // `group` has something to declare. Deeper nesting is left generic.
      if (parts.length < 2 || parts.length > 3) continue;

      const raw = parts.at(-1);
      if (INHERITED.has(raw)) continue;

      const choice = raw.endsWith('[x]');
      const entry = {
        types: (element.type ?? []).map((type) => type.code),
        list: element.max === '*',
        choice,
        required: (element.min ?? 0) > 0,
      };

      // A few elements carry no type of their own and point at another
      // element's definition instead — `ClaimResponse.adjudication` reuses
      // `ClaimResponse.item.adjudication`. Recorded so they read as backbones
      // rather than as untyped.
      if (element.contentReference !== undefined) {
        entry.contentReference = element.contentReference.replace(/^#/, '');
      }

      const name = choice ? raw.slice(0, -3) : raw;

      if (parts.length === 2) {
        fields[name] = entry;
        continue;
      }

      // A child: hang it off its parent, which the snapshot always lists first.
      const parent = fields[parts[1]];
      if (parent === undefined) continue;

      parent.fields ??= {};
      parent.fields[name] = entry;
    }

    digest[definition.name] = fields;
  }

  const resources = Object.keys(digest).length;
  const elements = Object.values(digest).reduce((total, f) => total + Object.keys(f).length, 0);

  writeFileSync(OUTPUT, `${JSON.stringify(digest, null, 0)}\n`);
  console.log(`wrote spec/r4-elements.json — ${resources} resources, ${elements} elements`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
