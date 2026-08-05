#!/usr/bin/env node
/**
 * Regenerates the spec digests the conformance tests check against:
 *
 *   spec/r4-elements.json     every R4 element, with type and cardinality
 *   spec/stu3-keys.json       the payload keys an STU3 resource can carry
 *   spec/r5-keys.json         the same for R5
 *
 * The R4 digest backs the shape tables; the STU3 and R5 key sets back the
 * cross-version migration table, which is only safe if each marker field
 * really belongs to the release it claims and really is absent from R4.
 *
 * All three are committed so the suite stays offline and deterministic. This
 * script exists so their provenance is reproducible rather than asserted, and
 * needs running only when the definitions change — for frozen releases, never.
 *
 *   node scripts/fetch-r4-spec.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const capitalize = (value) => value[0].toUpperCase() + value.slice(1);

/** Downloads one release's resource profiles and returns its StructureDefinitions. */
const definitionsFor = (release) => {
  const work = mkdtempSync(join(tmpdir(), `fhir-${release.toLowerCase()}-`));

  try {
    const archive = join(work, 'definitions.json.zip');

    // curl over fetch: the definitions are several MB zipped, and a truncated
    // download yields a digest that is silently short rather than an error.
    execFileSync('curl', [
      '-sSL',
      '--fail',
      '--retry',
      '3',
      '-o',
      archive,
      `http://hl7.org/fhir/${release}/definitions.json.zip`,
    ]);
    execFileSync('unzip', ['-t', archive], { stdio: 'ignore' });
    execFileSync('unzip', ['-o', '-q', '-d', work, archive, 'profiles-resources.json']);

    const bundle = JSON.parse(readFileSync(join(work, 'profiles-resources.json'), 'utf8'));

    return (bundle.entry ?? [])
      .map((entry) => entry.resource)
      .filter(
        (resource) =>
          resource?.resourceType === 'StructureDefinition' &&
          resource.kind === 'resource' &&
          resource.derivation !== 'constraint' &&
          resource.abstract !== true,
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

/** What the digest records about one element. */
const entryFor = (element, choice) => {
  const entry = {
    types: (element.type ?? []).map((type) => type.code),
    list: element.max === '*',
    choice,
    required: (element.min ?? 0) > 0,
  };

  // A few elements carry no type of their own and point at another element's
  // definition instead — `ClaimResponse.adjudication` reuses
  // `ClaimResponse.item.adjudication`. Recorded so they read as backbones
  // rather than as untyped.
  if (element.contentReference !== undefined) {
    entry.contentReference = element.contentReference.replace(/^#/, '');
  }

  return entry;
};

/** One resource's elements, plus one level inside each backbone. */
const fieldsFor = (definition) => {
  const fields = {};

  for (const element of definition.snapshot?.element ?? []) {
    const parts = element.path.split('.');

    // Top-level elements, plus one level inside a backbone so a generated
    // `group` has something to declare. Deeper nesting is left generic.
    if (parts.length < 2 || parts.length > 3) continue;

    const raw = parts.at(-1);
    if (INHERITED.has(raw)) continue;

    const choice = raw.endsWith('[x]');
    const name = choice ? raw.slice(0, -3) : raw;
    const entry = entryFor(element, choice);

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

  return fields;
};

/** The full R4 digest: types, cardinality, and one level inside each backbone. */
const elementDigest = (definitions) =>
  Object.fromEntries(definitions.map((d) => [d.name, fieldsFor(d)]));

/**
 * The literal top-level keys a payload of this release can carry.
 *
 * A choice element is expanded per type, because that is how it is serialized:
 * `medication[x]` never appears as `medication`, only as
 * `medicationCodeableConcept` or `medicationReference`. The migration table
 * matches on payload keys, so this is what it must be checked against.
 */
const keysFor = (definition) => {
  const keys = new Set();

  for (const element of definition.snapshot?.element ?? []) {
    const parts = element.path.split('.');
    if (parts.length !== 2) continue;

    const raw = parts[1];
    if (INHERITED.has(raw)) continue;

    if (!raw.endsWith('[x]')) {
      keys.add(raw);
      continue;
    }

    const base = raw.slice(0, -3);
    for (const type of element.type ?? []) keys.add(base + capitalize(type.code));
  }

  return [...keys].sort();
};

const keyDigest = (definitions) => Object.fromEntries(definitions.map((d) => [d.name, keysFor(d)]));

const write = (filename, digest, describe) => {
  writeFileSync(new URL(`../spec/${filename}`, import.meta.url), `${JSON.stringify(digest)}\n`);
  console.log(`wrote spec/${filename} — ${describe(digest)}`);
};

const r4 = definitionsFor('R4');

write('r4-elements.json', elementDigest(r4), (d) => {
  const elements = Object.values(d).reduce((total, f) => total + Object.keys(f).length, 0);
  return `${Object.keys(d).length} resources, ${elements} elements`;
});

for (const [release, filename] of [
  ['STU3', 'stu3-keys.json'],
  ['R5', 'r5-keys.json'],
]) {
  write(filename, keyDigest(definitionsFor(release)), (d) => {
    const keys = Object.values(d).reduce((total, k) => total + k.length, 0);
    return `${Object.keys(d).length} resources, ${keys} keys`;
  });
}
