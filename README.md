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

`1.5.0`. The public surface — `ParseResult`, `FormatParser`, `ResultTransform`, and the `Normalizer`
methods — is stable under semver; anything breaking lands in a major.

| Format | Status |
| --- | --- |
| FHIR JSON (resource, Bundle, or array) | ✅ Supported |
| FHIR XML | ✅ Supported |
| Cross-version STU3 / R5 → R4 | ✅ Supported (curated field set) |
| Simplified view (choice types resolved) | ✅ Supported (full Base + Clinical sections) |
| De-identification | ✅ Supported (structural; see the limits below) |
| HL7 v2, C-CDA, CSV | 📋 Later |

## Install

```bash
npm install fhir-normalize
yarn add fhir-normalize
pnpm add fhir-normalize
bun add fhir-normalize
```

All four install the same package from npm — there is no separate registry per package manager.
Each of these was verified against the published release, including the subpath entry points under
Yarn's Plug'n'Play and pnpm's isolated `node_modules`, which are the strictest resolvers of the set.

Ships ESM + CJS with generated type declarations. No runtime configuration required.

> [!NOTE]
> **pnpm may install an older version than you expect.** pnpm 11 holds back very recent releases by
> default (`minimumReleaseAge`) as a supply-chain precaution, so `pnpm add fhir-normalize` shortly
> after a release can resolve to the previous one. Ask for the version explicitly —
> `pnpm add fhir-normalize@latest` — if you need it immediately. This is pnpm's policy, not
> something this package controls.

### Import paths and bundle size

The package has three entry points. The root re-exports everything, so a single import still works;
the subpaths let a bundler leave out what you do not use.

```ts
import { createDefaultNormalizer } from 'fhir-normalize';              // parsing
import { simplifyBundle, formatShape } from 'fhir-normalize/simplified';
import { deIdentifyBundle } from 'fhir-normalize/deidentify';
```

The 74 resource shape tables are the bulk of the library, and they only ship if you import from
`/simplified`. Measured on a real install, minified:

| What you import | Library code |
| --- | --- |
| parsing only | ~15 KB |
| parsing + the simplified view | ~48 KB |

`fast-xml-parser` adds about 62 KB on top and is linked by any root import, because
`createDefaultNormalizer` registers both parsers. There is no way to avoid it today short of not
supporting XML.

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

### One predictable shape per resource

Normalizing the *format* still leaves FHIR's own polymorphism. `Observation.value[x]` alone arrives
as `valueQuantity`, `valueCodeableConcept`, `valueString`, `valueBoolean`, `valueRange`,
`valueRatio`, `valuePeriod` — so downstream code keeps branching. `simplifyBundle` removes that:

```ts
import { createDefaultNormalizer, simplifyBundle } from 'fhir-normalize';

const { bundle } = createDefaultNormalizer().parse(raw);
const [observation] = simplifyBundle(bundle);

observation.display;            // 'Body Weight · 74.5 kg'
observation.fields.value.kind;  // 'quantity'
observation.fields.value.text;  // '74.5 kg'
```

Whatever the input used, the value lands on **one key** with a `kind` discriminant:

| Input element | Output | `kind` | `text` |
| --- | --- | --- | --- |
| `valueQuantity` | `value` | `quantity` | `74.5 kg` |
| `valueCodeableConcept` | `value` | `concept` | `Present` |
| `valueString` | `value` | `string` | `Sample looked normal` |
| `valueRange` | `value` | `range` | `4.5 mmol/L – 6.1 mmol/L` |
| `valueRatio` | `value` | `ratio` | `1 mg / 5 mL` |

The same applies to every choice element — `effective[x]`, `onset[x]`, `performed[x]`,
`occurrence[x]`, `medication[x]`. This is read from the element name, which the spec guarantees
encodes the type.

Datatypes are flattened to fixed shapes too, so the variation *within* a field disappears:

- **CodeableConcept and bare Coding** read the same, with `text` filled from `text`, then
  `coding[0].display`, then `coding[0].code`. `Encounter.class` is a Coding in R4 and a
  CodeableConcept in R5 — both land identically.
- **References** are split: `{ reference: 'Patient/pat-1', resourceType: 'Patient', id: 'pat-1' }`.
- **Repeating elements are always arrays**, even with one item, so `name[0]` is safe.
- **Backbone elements keep their structure** — `Observation.component` stays a list of
  `{ code, value }` with each `value` resolved.

**Every value carries `text`.** A consumer that only wants to display something never switches on
`kind` at all.

**Coverage: the whole Base and Clinical sections** of the
[FHIR resource list](https://build.fhir.org/resourcelist.html) — Individuals, Entities, Workflow,
Management, Summary, Diagnostics, Medications, Care Provision, and Request &amp; Response — plus the
R4 members the current build renamed or dropped, and the Foundation resources clinical payloads
carry most often. A test transcribes both section lists and fails if any entry loses its shape.

Resource types renamed across releases resolve through an alias, so `DeviceUsage` (R5) and
`DeviceAssociation` (R6) both land on the R4 `DeviceUseStatement` shape.

**Nothing is dropped.** An element a shape does not declare is still read — with a generic
reading rather than a curated one — and its name is reported in `unmapped`. An incomplete shape
therefore costs fidelity of *interpretation*, never the data itself. A resource type with no shape
at all still gets its choice elements resolved; it just has no curated field ordering.

This layer is **additive and read-only** — it takes the canonical Bundle and returns a new
structure, leaving `parse()` output untouched.

### See the shape before you write against it

To model your own types around the output, you need to know what a resource's simplified structure
looks like — without hunting for a payload that happens to exercise every field. `formatShape`
prints it:

```ts
import { formatShape } from 'fhir-normalize';

console.log(formatShape('Observation'));
```

```
Observation

  status                       primitive
  category                     concept[]
  code                         concept
  subject                      reference
  effective                    choice
  value                        choice
  component                    group[]
    code                       concept
    value                      choice

value shapes
  concept      { kind, text, code, system, display, codings }
  quantity     { kind, text, value, unit, system, code, comparator }
  reference    { kind, text, reference, resourceType, id, display }

resolved at runtime
  primitive    resolves to string, boolean, or number from the payload
  choice       any kind above — read `kind` to tell which
```

The legend lists only the value shapes that resource actually uses, and its property names are
read off the normalizers themselves — so the description cannot drift from what `simplifyResource`
returns.

For modelling, ask for an interface instead and paste it straight into your code:

```ts
formatShape('Observation', DESCRIBE_FORMAT.TYPESCRIPT);
```

```ts
interface SimplifiedObservation {
  resourceType: string;
  id: string | null;
  display: string;
  unmapped: string[];
  fields: {
    code?: NormalizedConcept;
    category?: NormalizedConcept[];
    value?: NormalizedValue;
    component?: {
      code?: NormalizedConcept;
      value?: NormalizedValue;
    }[];
  };
}
```

Every member is optional because a field is omitted when the source resource does not carry it —
the shape declares what *can* appear, not what must. The type names are the ones this package
exports, so the interface compiles as-is.

`describeShape` returns the same information as data if you want to generate something else from
it, and `listShapes()` enumerates every resource type with a declared shape.

### De-identification

Pass `deIdentify` to strip direct identifiers as a post-parse stage:

```ts
const normalizer = createDefaultNormalizer({ deIdentify: true });
const { bundle, meta } = normalizer.parse(raw);
```

Names, telecom, addresses, photos, the rendered narrative, and free text are removed. Dates are
reduced to a year. Ids and references are replaced with stable surrogates, so **the Bundle still
resolves** — a Patient and every reference to it get the same surrogate:

```jsonc
// before                                    // after
"id": "pat-1"                                "id": "14r0qpguzuvg"
"subject": {                                 "subject": {
  "reference": "Patient/pat-1",                "reference": "Patient/14r0qpguzuvg"
  "display": "Ali Khan"                      }
}
```

Clinical content survives: the LOINC code, `74.5 kg`, and `status` are all untouched. `Coding.display`
("Body Weight") is kept because it is vocabulary; `Reference.display` ("Ali Khan") is removed because
it is usually a person. Those share an element name and are told apart by structure.

```ts
createDefaultNormalizer({
  deIdentify: {
    dates: 'year',        // 'year' | 'redact' | 'keep'
    freeText: 'redact',   // 'redact' | 'keep'
    pseudonymizeIds: true,
    salt: process.env.DEID_SALT,
    keep: ['birthDate'],
  },
});
```

`deIdentifyBundle(bundle, options)` does the same thing as a plain function and returns a report of
what changed.

> [!IMPORTANT]
> **Read these limits before releasing anything.**
>
> - **This is not certified HIPAA Safe Harbor or GDPR anonymisation.** It is a structural pass that
>   acts on element names and datatypes. Whether your output meets your obligations is a judgement
>   only you can make. Every de-identified parse says so in `meta.warnings`.
> - **Surrogates are pseudonyms, not a one-way seal.** They use a fast non-cryptographic hash,
>   because the pass must run synchronously in a browser where `node:crypto` is unavailable. Anyone
>   who knows the salt and can guess the input space can confirm a guess. Use a long random `salt`
>   you do not publish, and treat the result as pseudonymised rather than anonymised.
> - **Free text is removed by default, and that default is doing real work.** Clinical prose names
>   patients, relatives, and dates, and no structural rule finds that reliably. Setting
>   `freeText: 'keep'` re-admits that risk and adds a warning saying so.
> - **Safe Harbor rules this does not implement**: ages over 89 are not aggregated, and dates are
>   generalized rather than date-shifted, so intervals between events remain intact.
> - **`unmapped` does not apply here.** De-identification removes data on purpose; it is the one
>   part of this library that is deliberately lossy.

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
| `simplifyBundle`, `simplifyResource` | The simplified view: choice types resolved, datatypes flattened. |
| `resolveChoice` | Resolves one `value[x]`-style element on its own. |
| `formatShape`, `describeShape`, `listShapes` | The simplified structure of a resource type, printed or as data. |
| `shapeFor`, `valueProperties` | Shape lookup with alias resolution, and a value kind's property names. |
| `deIdentifyBundle`, `createDeIdentifyTransform` | Structural de-identification, as a function or a stage. |
| `DATE_POLICY`, `FREE_TEXT_POLICY`, `REDACT_ELEMENT` | De-identification policy tokens and the redact list. |
| `RESOURCE_SHAPE`, `VALUE_KIND` | The per-resource field specs and the value-kind tokens. |
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
travel with the repo and get reviewed. Two notes on them:

- `buildCommand` uses `pnpm --filter`, which resolves the workspace by walking up to
  `pnpm-workspace.yaml` and so behaves the same from the repo root and from `playground/`.
- Vercel's Root Directory is `playground`, and `outputDirectory` is resolved relative to it — hence
  `.next`, not `playground/.next`. It is set explicitly so the value in `vercel.json` wins over
  whatever is stored in the dashboard.

## Development

This repo is a pnpm workspace. The library lives in
[`packages/fhir-normalize`](packages/fhir-normalize).

```bash
pnpm install
pnpm verify      # build, lint, typecheck, test — the same gate CI runs
```

Release history is in [CHANGELOG.md](CHANGELOG.md).

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
