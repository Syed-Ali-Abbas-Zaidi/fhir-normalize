# fhir-normalize

[![npm](https://img.shields.io/npm/v/fhir-normalize.svg)](https://www.npmjs.com/package/fhir-normalize)
[![CI](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/actions/workflows/ci.yml/badge.svg)](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/fhir-normalize.svg)](LICENSE)

Ingest healthcare data in several formats and get back **one standard shape**: a FHIR R4 `Bundle`.

Write your downstream logic once, against one type, instead of branching per source system.

```ts
import { createDefaultNormalizer } from 'fhir-normalize';

const normalizer = createDefaultNormalizer();
const { bundle, meta } = normalizer.parse(rawInput); // format auto-detected

bundle.entry?.forEach((entry) => console.log(entry.resource?.resourceType));
console.log(meta.sourceFormat, meta.warnings);
```

`bundle` is a FHIR R4 `Bundle` — the real industry standard, not a bespoke dialect. The type comes
from [`@types/fhir`](https://www.npmjs.com/package/@types/fhir) and is re-exported, so you can name
it without adding your own dependency:

```ts
import type { Bundle, FhirResource } from 'fhir-normalize';
```

## Status

`1.0.0`. The public surface — `ParseResult`, `FormatParser`, `ResultTransform`, and the `Normalizer`
methods — is stable under semver; anything breaking lands in a major.

| Format | Status |
| --- | --- |
| FHIR JSON (resource, Bundle, or array) | ✅ Supported |
| FHIR XML | ✅ Supported |
| Cross-version STU3 / R5 → R4 | ✅ Supported (curated field set) |
| HL7 v2, C-CDA, CSV | 📋 Later |

## Install

```bash
npm install fhir-normalize
```

Ships ESM + CJS with generated type declarations. No runtime configuration required.

## Usage

### Auto-detect, or name the format

```ts
import { createDefaultNormalizer, SOURCE_FORMAT } from 'fhir-normalize';

const normalizer = createDefaultNormalizer();

normalizer.parse(raw);                            // auto-detect
normalizer.parse(raw, SOURCE_FORMAT.FHIR_JSON);   // skip detection
normalizer.detectFormat(raw);                     // 'fhir-json' | ... | null
```

Input can be a JSON string or an already-parsed object.

### XML in, the same shape out

The same call handles FHIR XML. Element names become `resourceType`, `value` attributes become
primitives, and the extra `<resource>` level that XML wraps Bundle entries in is unwrapped:

```ts
normalizer.parse('<Patient><id value="x"/><gender value="male"/></Patient>');
// -> identical bundle.entry to parsing {"resourceType":"Patient","id":"x","gender":"male"}
```

**XML carries no schema, so two things are inferred** — and every XML parse says so in
`meta.warnings`:

- **Cardinality.** A lone `<name>` is indistinguishable from a one-item list, so repeating
  elements are recognised by name. Elements outside that set stay scalar when they occur once.
- **Primitive types.** Everything in XML is a string. Types are recovered only where the spec is
  unambiguous — `value[x]` suffixes encode their own type (`valueInteger` → number), plus a few
  fixed-type names. Anything else stays a string, deliberately: `<postalCode value="02134"/>`
  must not become `2134`.

### Older and newer releases land on R4

STU3 and R5 resources are migrated to R4 automatically, so the canonical shape holds across
releases as well as serializations:

```ts
normalizer.parse('{"resourceType":"Observation","status":"final","context":{"reference":"Encounter/e"}}');
// -> resource.encounter is set; resource.context is gone
// -> meta.warnings: ['Observation [0]: STU3 field "context" is "encounter" in R4 — migrated. …']
```

FHIR resources do not record which release they belong to, so this is **marker-driven**: each
migration fires on a field that only exists in the older or newer release. Genuine R4 input is
returned untouched with no warnings, and a bundle mixing releases is handled resource by resource.

Migrations that cannot be bridged losslessly say so in `meta.warnings` — STU3
`Observation.related` carries a relationship type R4 has nowhere to put, and R5 `Encounter.class`
allows several codings where R4 allows one.

**The migration table is curated, not exhaustive.** It covers well-known differences across
Observation, Condition, Procedure, Communication, CarePlan, MedicationRequest, Patient, Encounter,
and DocumentReference. A wrong migration silently corrupts clinical data, so differences that
aren't certain are deliberately left alone rather than guessed at. Inspect or extend it via the
exported `VERSION_MIGRATION` table.

To keep the source release intact, assemble a normalizer without the stage:

```ts
const normalizer = new Normalizer().register(fhirJsonParser).register(fhirXmlParser);
```

### Warnings, not exceptions

Recoverable gaps never throw — they land in `meta.warnings` and the payload still comes back:

```ts
const { bundle, meta } = normalizer.parse('{"name":"Ali"}', SOURCE_FORMAT.FHIR_JSON);

bundle.entry;   // [{ resource: { name: 'Ali' } }]  — nothing dropped
meta.warnings;  // ['Root object has no "resourceType" — kept as-is, ...']
```

Only genuinely unreadable input throws:

- `UnsupportedFormatError` — no parser matched, or the requested format is not registered.
- `ParseError` — routed to a parser, but the bytes could not be decoded (malformed JSON, etc.).

Both extend `FhirNormalizeError`, so one `catch` covers the library.

### Assemble your own registry

`createDefaultNormalizer()` is a convenience. To control exactly what is registered:

```ts
import { Normalizer, fhirJsonParser } from 'fhir-normalize';

const normalizer = new Normalizer().register(fhirJsonParser);
```

Importing the package has no side effects, so this stays tree-shakeable and easy to test.

### Add a format the library doesn't support

Implement `FormatParser` and register it — no fork, no changes to the core:

```ts
import {
  createCollectionBundle,
  createParseResult,
  createWarningLog,
  SOURCE_FORMAT,
  type FormatParser,
} from 'fhir-normalize';

const csvParser: FormatParser = {
  format: SOURCE_FORMAT.CSV,
  canParse: (raw) => typeof raw === 'string' && raw.startsWith('id,'),
  parse: (raw) => {
    const warnings = createWarningLog();
    warnings.add('CSV mapping only reads the id column.');

    return createParseResult({
      sourceFormat: SOURCE_FORMAT.CSV,
      bundle: createCollectionBundle(toResources(raw)),
      warnings: warnings.list(),
    });
  },
};

normalizer.register(csvParser);
```

Registering an already-registered format replaces it, so you can also override a built-in parser.

## API

| Export | What it is |
| --- | --- |
| `Normalizer` | The registry. `register()`, `use()`, `parse()`, `detectFormat()`, `formats`, `stages`. |
| `r4VersionTransform` | The built-in STU3/R5 → R4 post-parse stage. |
| `ResultTransform` | The contract for a custom post-parse stage. |
| `VERSION_MIGRATION`, `FHIR_VERSION` | The migration table and release tokens. |
| `createDefaultNormalizer()` | A `Normalizer` with all built-in parsers registered. |
| `fhirJsonParser`, `fhirXmlParser` | The built-in adapters. |
| `ParseResult` | `{ bundle, meta: { sourceFormat, parsedAt, warnings } }`. |
| `FormatParser` | The adapter contract to implement for a new format. |
| `FhirNormalizeError`, `UnsupportedFormatError`, `ParseError` | Error types. |
| `createParseResult`, `createWarningLog`, `createCollectionBundle` | Helpers for writing an adapter. |
| `SOURCE_FORMAT`, `BUNDLE_TYPE`, `RESOURCE_TYPE` | Token constants; the string unions derive from these. |
| `isBundle`, `isBundleType` | Type guards. |

## Playground

[`playground/`](playground) is a Next.js app that runs the library in the browser: paste raw data
on the left, watch it come out as the standard shape on the right, with the detected format, the
extracted resources, and the warnings each on their own tab.

It imports `fhir-normalize` from the workspace rather than a published build, so the demo cannot
drift from the library — change a parser and the page reflects it.

```bash
pnpm --filter fhir-normalize build   # the playground consumes dist/
pnpm --filter playground dev
```

The playground's own `build` and `dev` scripts build the library first. That is deliberate: it makes
them work from any directory and on any host, rather than depending on something earlier in the
chain having built `dist/`. Vercel runs its build inside `playground/`, so a command that only works
from the repo root fails there.

Deployment settings live in [`vercel.json`](vercel.json) rather than the Vercel dashboard, so they
travel with the repo and get reviewed. Both entries are written to be independent of the working
directory — `pnpm --filter` resolves the workspace by walking up to `pnpm-workspace.yaml`, so it
behaves the same from the repo root and from `playground/`.

## Development

This repo is a pnpm workspace. The library lives in
[`packages/fhir-normalize`](packages/fhir-normalize).

```bash
pnpm install
pnpm verify      # build, lint, typecheck, test — the same gate CI runs
```

Individually:

```bash
pnpm build       # tsup -> dual ESM + CJS + .d.ts
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit, both packages
pnpm lint        # biome
```

Build the library first. The playground resolves `fhir-normalize`'s types from `dist/`, so a clean
checkout cannot typecheck or build it until the library has been built once — which is why `verify`
and the CI workflow both start there.

## Releasing

The version tag drives the release; pushing one runs the full gate and publishes only if it passes
and the tag matches the package version.

```bash
git tag v1.0.0 && git push origin v1.0.0
```

Needs an `NPM_TOKEN` repository secret with publish rights. To publish by hand instead:

```bash
pnpm build
pnpm --filter fhir-normalize publish --access public
```

`prepack` refuses to pack without a build and copies the README and licence into the package, since
npm only picks those up from the package directory.

The canonical model is FHIR R4, and every format is normalized to it by an independent adapter
behind a single registry, so adding a format never changes existing code.

## License

MIT
