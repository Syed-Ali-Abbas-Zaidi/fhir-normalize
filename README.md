# fhir-normalize

[![npm](https://img.shields.io/npm/v/fhir-normalize.svg)](https://www.npmjs.com/package/fhir-normalize)
[![CI](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/actions/workflows/ci.yml/badge.svg)](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/fhir-normalize.svg)](LICENSE)

Ingest healthcare data in several formats and get back **one standard shape**: a FHIR R4 `Bundle`.
Write your downstream logic once, against one type, instead of branching per source system.

**[Try it in the playground →](https://fhir-normalize-playground.vercel.app)**

```ts
import { createDefaultNormalizer } from 'fhir-normalize';

const { bundle, meta } = createDefaultNormalizer().parse(rawInput); // format auto-detected

bundle.entry?.forEach((entry) => console.log(entry.resource?.resourceType));
console.log(meta.sourceFormat, meta.warnings);
```

`bundle` is a real FHIR R4 `Bundle`, not a bespoke dialect. Its type comes from
[`@types/fhir`](https://www.npmjs.com/package/@types/fhir) and is re-exported, so you can name it
without adding your own dependency:

```ts
import type { Bundle, FhirResource } from 'fhir-normalize';
```

## Status

`2.8.1`. The public surface — `ParseResult`, `FormatParser`, `ResultTransform` and the `Normalizer`
methods — is stable under semver.

| Format | Status |
| --- | --- |
| FHIR JSON (resource, Bundle, or array) | ✅ |
| FHIR XML | ✅ via `fhir-normalize/xml` |
| NDJSON (Bulk Data `$export`) | ✅ |
| Streaming NDJSON, past the 512 MB string ceiling | ✅ via `fhir-normalize/stream` |
| HL7 v2 in (ADT / ORU segments) | ✅ via `fhir-normalize/hl7v2` |
| Cross-version STU3 / R5 → R4 | ⚠️ Partial — [see coverage](#older-and-newer-releases-land-on-r4) |
| Simplified view (choice types resolved) | ✅ 147 resource types |
| Flat rows, for CSV and tabular loads | ✅ via `fhir-normalize/simplified` |
| De-identification | ✅ structural — [read the limits](#de-identification) |
| R4 conformance checking | ✅ structural, via `fhir-normalize/validate` |
| C-CDA, CSV in | 📋 Later |

## Install

```bash
npm install fhir-normalize
```

Ships ESM + CJS with type declarations. No runtime configuration. Works under npm, yarn, pnpm and
bun, including yarn PnP and pnpm's isolated `node_modules`.

> [!NOTE]
> pnpm 11 holds back very recent releases by default, so `pnpm add fhir-normalize` shortly after a
> release can resolve to the previous one. Ask for `fhir-normalize@latest` if you need it now.

## Entry points

Seven of them. The root re-exports the JSON-family parsers plus the simplified and de-identify
layers, so a single import works; the subpaths let a bundler leave out what you do not use.

```ts
import { createDefaultNormalizer } from 'fhir-normalize';              // parsing
import { simplifyBundle, formatShape, toRows } from 'fhir-normalize/simplified';
import { deIdentifyBundle } from 'fhir-normalize/deidentify';
import { fhirXmlParser } from 'fhir-normalize/xml';                    // opt in
import { validateBundle } from 'fhir-normalize/validate';              // opt in
import { parseNdjsonStream } from 'fhir-normalize/stream';             // opt in
import { hl7v2Parser } from 'fhir-normalize/hl7v2';                    // opt in
```

Measured on a real install, minified, with dependencies included:

| What you import | Bundled |
| --- | --- |
| parsing only | **~19 KB** (~7 KB gzipped) |
| parsing + streaming | ~21 KB (~8 KB gzipped) |
| parsing + HL7 v2 | ~29 KB (~11 KB gzipped) |
| validation, on its own | ~80 KB (~16 KB gzipped) |
| parsing + the simplified view | ~84 KB (~24 KB gzipped) |
| parsing + XML | ~106 KB (~35 KB gzipped) |

**XML and HL7 v2 are opt in.** `fast-xml-parser` is ~61 KB and is not side-effect-free, so a bundler
cannot drop it — registering it by default would charge every consumer for a format most never use.
Adding it back is one line:

```ts
const normalizer = createDefaultNormalizer().register(fhirXmlParser);
```

## Usage

### Auto-detect, or name the format

`parse()` detects the format from the payload. Registration order is detection order, and the first
match wins. To skip detection, name the format:

```ts
normalizer.parse(raw, SOURCE_FORMAT.FHIR_JSON);
normalizer.detectFormat(raw); // 'fhir-json' | 'fhir-xml' | 'ndjson' | null
```

### XML in, the same shape out

```ts
normalizer.parse('<Patient><id value="x"/><gender value="male"/></Patient>');
// -> identical bundle.entry to parsing {"resourceType":"Patient","id":"x","gender":"male"}
```

**XML carries no schema, so two things are inferred**, and every XML parse says so in
`meta.warnings`. **Cardinality** is read from the R4 definitions per resource type, because a lone
`<name>` is indistinguishable from a one-item list — `Patient.name` is an array, `Organization.name`
is not. **Primitive types** are recovered only where the spec is unambiguous, such as a `value[x]`
suffix; everything else stays a string, deliberately, so `<postalCode value="02134"/>` does not
become `2134`.

### Bulk Data exports

`$export` returns NDJSON — one resource per line, routinely hundreds of megabytes. Handed the whole
string, it reads like any other format:

```ts
normalizer.parse(await readFile('Observation.ndjson', 'utf8'));
```

Detection inspects the first few lines rather than the file, and needs two or more resource lines —
so a single JSON resource still goes to the FHIR JSON adapter. A line that is not a JSON resource is
skipped and reported in `meta.warnings` rather than failing the export.

#### A file too large to be a string

A JavaScript string cannot exceed **512 MB**, so past that an export cannot be handed to `parse()`
at all. `fhir-normalize/stream` reads the source a piece at a time and yields a normal `ParseResult`
every `batchSize` resources:

```ts
import { createReadStream } from 'node:fs';
import { parseNdjsonStream } from 'fhir-normalize/stream';

const options = { batchSize: 1000, normalizer: createDefaultNormalizer() };

for await (const { bundle, meta } of parseNdjsonStream(createReadStream(path), options)) {
  await db.insertMany(bundle.entry ?? []);
  if (meta.warnings.length > 0) console.warn(meta.warnings);
}
```

**Each batch is exactly what `parse()` returns**, so `simplifyBundle`, `validateBundle` and `toRows`
all take it as-is. Pass a `normalizer` and its stages run over every batch; leave it out and the
batches carry what the file held.

The source is any `AsyncIterable<string | Uint8Array>` — a Node `Readable`, a web `ReadableStream`
and an async generator all qualify. Chunk boundaries landing mid-line or mid-character are handled.
A single line longer than `maxLineLength` (32 MB) is refused rather than buffered, since a file with
no newlines would otherwise exhaust memory exactly as `parse()` does.

Measured by `pnpm --filter fhir-normalize bench`, peak resident set size:

| Export | `parse()` | `parseNdjsonStream()` |
| --- | --- | --- |
| 250 MB, 822,000 resources | 1.6 s, **1,014 MB** | 1.1 s, **120 MB** |
| 700 MB, 2,302,000 resources | `ERR_STRING_TOO_LONG` | 3.3 s, **186 MB** |

Both columns run the same post-parse stages. Streaming is sublinear rather than flat — 2.8 times the
input costs 1.6 times the memory — but it never scales with the file, which is the difference
between an export that fits and one that does not.

> [!NOTE]
> **NDJSON only.** A single enormous JSON Bundle or XML document needs an incremental parser, which
> this is not. For those, `parse()` and the 512 MB ceiling still apply.

### HL7 v2 in, FHIR out

```ts
import { hl7v2Parser } from 'fhir-normalize/hl7v2';

const { bundle, meta } = createDefaultNormalizer().register(hl7v2Parser).parse(adtMessage);
```

| Segment | Becomes |
| --- | --- |
| `PID` | `Patient` — identifiers, names, birth date, gender, address, telecom, marital status, deceased |
| `PV1` | `Encounter` — class, identifier, type, period |
| `OBX` | `Observation` — code, status, and the `value[x]` that `OBX-2` asks for |
| `AL1` | `AllergyIntolerance` — code, criticality, reaction |
| `DG1` | `Condition` — code, recorded date |

Everything else is skipped and **named in `meta.warnings`**. The first `PID` becomes the subject of
every other resource in the message.

Two details, both places a v2 parser usually goes wrong. **Delimiters are read from `MSH-1` and
`MSH-2`**, and escape sequences are decoded after splitting rather than before — `\S\` is how a
message carries a literal component separator. And **a timestamp with no UTC offset loses its
time**: R4's `dateTime` requires a timezone once hours are present, so the date is kept and the loss
reported rather than assuming UTC.

> [!NOTE]
> **A curated subset, not the v2-to-FHIR implementation guide**, which is a specification in its own
> right. This covers the segments carrying the substance of an ADT or ORU message, and says plainly
> when it skips something.

### Older and newer releases land on R4

STU3 and R5 differences are migrated automatically:

```ts
normalizer.parse('{"resourceType":"Observation","status":"final","context":{"reference":"Encounter/e"}}');
// -> resource.encounter is set; resource.context is gone
// -> meta.warnings: ['Observation [0]: STU3 field "context" is "encounter" in R4 — migrated. …']
```

FHIR resources do not record which release they belong to, so this is **marker-driven**: a migration
fires on a field that only exists in the other release. Genuine R4 input comes back untouched, and a
bundle mixing releases is handled resource by resource. Migrations that cannot be bridged losslessly
say so in `meta.warnings`.

Measured against the published definitions:

| | Differing from R4 | Migrated | Fits a pattern, no row | Not migrated |
| --- | --- | --- | --- | --- |
| STU3 → R4 | 193 | 59 | 0 | 134 |
| R5 → R4 | 601 | 38 | 0 | 563 |

The third column is zero by test: every migration is applied to **every** resource the definitions
say it fits, not to the resource types someone thought to list. Across the sixteen resource types
that dominate a real export, every STU3 element that differs from R4 is migrated — 34 of 34.

The last column is not a backlog. It spreads across 98 resource types, more than half of it on
definitional and conformance resources a clinical pipeline never receives, and much of the rest is
R5 concepts with no R4 counterpart in any form. Those pass through untouched and
[validation](#checking-that-a-payload-really-is-r4) names every one with its path.

Five further rows fire only behind an `applies` guard, because their fields exist in R4 as well:
`MedicationRequest.requester`, `Encounter.reason`, `Encounter.class`, `Appointment.reason` and
`ImagingStudy.reason`. The table has 99 rows in total, across 34 resource types, and every figure
here is asserted by a test against `VERSION_MIGRATION` and the spec digests.

Inspect or extend the table via the exported `VERSION_MIGRATION`.

### Checking that a payload really is R4

```ts
import { validateBundle } from 'fhir-normalize/validate';

for (const issue of validateBundle(bundle)) {
  console.log(issue.severity, issue.path, issue.message);
}
// warning  Bundle.entry[0].resource.informationSource   R4 defines no such element on MedicationRequest.
```

`validateResource(resource)` does one resource. Both return a flat array rather than throwing, so a
payload with fifty problems reports fifty.

| Severity | What it means |
| --- | --- |
| `error` | Structural: wrong cardinality, an empty array, a missing required element, or a choice carrying a type R4 forbids. |
| `warning` | R4 defines no such element, or no such resource type. Usually an extension-adjacent field or one from another release. |

It descends one level into backbone elements, and **a nested resource is checked like any other** —
in `contained`, in a Bundle held by another Bundle, and in `Parameters.parameter.resource`. The path
says how it was reached: `Bundle.entry[0].resource.contained[0].gender`. Nesting is bounded at 100
levels, beyond which the walk stops and reports that it did.

> [!NOTE]
> **Structural conformance against base R4, not the official validator.** It does not check
> terminology bindings, profiles such as US Core, or FHIRPath invariants. It answers "are these the
> right element names, in the right shapes" and nothing more.

### One predictable shape per resource

Normalizing the *format* still leaves FHIR's own polymorphism: `Observation.value[x]` arrives as
`valueQuantity`, `valueCodeableConcept`, `valueString` and four more. `simplifyBundle` removes that:

```ts
import { simplifyBundle } from 'fhir-normalize';

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

The same applies to every choice element — `effective[x]`, `onset[x]`, `medication[x]` and the rest.

**The fields are typed per resource.** Pass a typed resource and `simplifyResource` infers which
fields exist and what each one is:

```ts
import type { Observation } from 'fhir/r4';
import { simplifyResource } from 'fhir-normalize/simplified';

const { fields } = simplifyResource(observation);

fields.code.text;        // string      — code is a CodeableConcept
fields.performer[0].id;  // string|null — performer is a Reference list
fields.value;            // the nine types R4 permits, so `switch (fields.value.kind)` is exhaustive
fields.notAThing;        // compile error
```

Name one directly as `ObservationFields`, or look it up with `FieldsOf<'Observation'>`. Input whose
type is not known statically still gets the loose map.

Datatypes are flattened to fixed shapes, so variation *within* a field disappears too:

- **CodeableConcept and bare Coding read the same**, with `text` filled from `text`, then
  `coding[0].display`, then `coding[0].code`.
- **References** split into `{ reference, resourceType, id }`.
- **Repeating elements are always arrays**, even with one item, so `name[0]` is safe.
- **Backbone elements keep their structure**, with each value resolved.
- **Every value carries `text`**, so a consumer that only displays never switches on `kind`.

Coverage is all 147 resource types, every element declared and checked against the R4 definitions.
`unmapped` is therefore a real signal: on a conforming R4 resource it is empty, and anything in it
is an extension, a field from another release, or a typo. **Nothing is dropped** — an undeclared
element is still read, with a generic reading rather than a curated one.

Resource types renamed across releases resolve through an alias, so `DeviceUsage` (R5) and
`DeviceAssociation` (R6) both land on the R4 `DeviceUseStatement` shape.

R4's `MedicinalProduct*` and `Substance*` family is deliberately unshaped, since R5 replaced it
wholesale with the `*Definition` resources that are covered. They still parse and still get their
choice elements resolved.

This layer is additive and read-only; `parse()` output is untouched.

### See the shape before you write against it

`formatShape` prints a resource's simplified structure, so you can model against it without hunting
for a payload that exercises every field:

```ts
formatShape('Observation');
```

```
Observation

  status                       primitive
  code                         concept
  subject                      reference
  value                        choice
  component                    group[]
    code                       concept
    value                      choice

value shapes
  concept      { kind, text, code, system, display, codings }
  quantity     { kind, text, value, unit, system, code, comparator }
```

Ask for an interface instead and paste it into your code:

```ts
formatShape('Observation', DESCRIBE_FORMAT.TYPESCRIPT);
```

Every member is optional, because the shape declares what *can* appear rather than what must. The
type names are the ones this package exports, so it compiles as-is. `describeShape` returns the same
information as data, and `listShapes()` enumerates every shaped resource type.

### Flat rows, for CSV and for tables

The simplified view has done the hard part, so `toRows` is the mechanical last step — one row per
resource, one column per field:

```ts
import { simplifyBundle, toRows } from 'fhir-normalize/simplified';

const rows = toRows(simplifyBundle(bundle));
// [{ resourceType: 'Observation', id: 'obs-1', code: 'Body Weight', value: '74.5 kg', … }]
```

A cell is `string | number | boolean | null` and nothing else. **No CSV text is emitted** — quoting
and escaping are solved problems, so rows hand off to whichever library already solved them.

**Columns are stable per resource type**, with `null` where a value is absent, so a writer cannot
produce ragged output. `columnsOf(rows)` gives the header and `toTables` returns a table each:

```ts
const tables = toTables(simplifyBundle(bundle));   // { Patient: [...], Observation: [...] }
```

Column names join with `_`, reading left to right: `component_0_value_unit` is
`component[0].value.unit`. **Repeating elements** default to the first entry with a `_count` column,
so the loss is visible:

| Options | `Patient.name` becomes | Grain |
| --- | --- | --- |
| *(default)* | `name`, `name_count` | one row per resource |
| `{ lists: 'index' }` | `name_0`, `name_1`, … | one row per resource |
| `{ explode: 'name' }` | `name`, `name_index`, `name_count` | one row per name |

**Backbone elements** flatten under their own prefix following the same rule — `component_code` by
default, `component_0_code` when indexed, nesting further as `component_referenceRange_low`.

`explode` names **one** field: exploding two lists at once produces their cross product. This is the
answer to the blood pressure Observation — `{ explode: 'component' }` gives a row for systolic and a
row for diastolic, with the code, subject and date duplicated onto each.

**What lands in a cell** is `text` by default. Ask for `typed` cells to get the code rather than its
display name, or the magnitude rather than its rendering:

```ts
toRows(resources, { cells: 'typed' })[0];
// { code: 'Body Weight', code_kind: 'concept', code_code: '29463-7',
//   code_system: 'http://loinc.org', value: '74.5 kg', value_value: 74.5, value_unit: 'kg', … }
```

Typed cells are a superset: every text column is still there, joined by the value's own properties
and a `_kind` column. Numbers stay numbers, booleans stay booleans, and values nested in values
flatten too.

### De-identification

```ts
const normalizer = createDefaultNormalizer({ deIdentify: true });
```

Names, telecom, addresses, photos, the rendered narrative and free text are removed. Dates are
reduced to a year. Ids and references become stable surrogates, so **the Bundle still resolves** — a
Patient and every reference to it get the same surrogate:

```jsonc
// before                                    // after
"id": "pat-1"                                "id": "14r0qpguzuvg"
"subject": {                                 "subject": {
  "reference": "Patient/pat-1",                "reference": "Patient/14r0qpguzuvg"
  "display": "Ali Khan"                      }
}
```

Clinical content survives. `Coding.display` ("Body Weight") is kept because it is vocabulary;
`Reference.display` ("Ali Khan") is removed because it is usually a person — they share an element
name and are told apart by structure. The same reasoning covers identifiers under another name:
`Location.position` goes with the address, `Device.udiCarrier` with the serial number, and
`Attachment.data` because a scanned letter is prose that happens to be base64.

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

`deIdentifyBundle(bundle, options)` does the same as a plain function and returns a report of what
changed; `deIdentifyResource` is the same pass over one resource.

> [!IMPORTANT]
> **Read these limits before releasing anything.**
>
> - **Not certified HIPAA Safe Harbor or GDPR anonymisation.** It is a structural pass over element
>   names and datatypes. Whether the output meets your obligations is a judgement only you can make.
> - **Surrogates are pseudonyms, not a one-way seal.** They use a fast non-cryptographic hash, so it
>   runs synchronously in a browser. Anyone with the salt who can guess the input space can confirm
>   a guess. Use a long random `salt` you do not publish.
> - **Free text is removed by default, and that default is doing real work.** Clinical prose names
>   patients, relatives and dates, and no structural rule finds that reliably.
> - **Safe Harbor rules not implemented**: ages over 89 are not aggregated, and dates are generalized
>   rather than shifted, so intervals between events remain intact.
> - This is the one part of the library that is deliberately lossy.

### Warnings, not exceptions

Recoverable gaps never throw — they land in `meta.warnings` and the payload still comes back:

```ts
const { bundle, meta } = normalizer.parse('{"name":"Ali"}', SOURCE_FORMAT.FHIR_JSON);

bundle.entry;   // [{ resource: { name: 'Ali' } }]  — nothing dropped
meta.warnings;  // ['Root object has no "resourceType" — kept as-is, ...']
```

Only genuinely unreadable input throws: `UnsupportedFormatError` when no parser matched, and
`ParseError` when the bytes could not be decoded. Both extend `FhirNormalizeError`, so one `catch`
covers the library.

### Your own registry, and your own formats

`createDefaultNormalizer()` is a convenience. Build the registry yourself to control what is in it,
and implement `FormatParser` to add a format without forking:

```ts
import { Normalizer, fhirJsonParser, SOURCE_FORMAT, type FormatParser } from 'fhir-normalize';

const csvParser: FormatParser = {
  format: SOURCE_FORMAT.CSV,
  canParse: (raw) => typeof raw === 'string' && raw.startsWith('id,'),
  parse: (raw) => createParseResult({ /* … */ }),
};

const normalizer = new Normalizer().register(fhirJsonParser).register(csvParser);
```

`createParseResult`, `createWarningLog` and `createCollectionBundle` are exported for exactly this.
Registering an already-registered format replaces it, so a built-in can be overridden. Importing the
package has no side effects, so this stays tree-shakeable.

## API

| Export | What it is |
| --- | --- |
| `Normalizer` | The registry. `register()`, `use()`, `parse()`, `detectFormat()`, `formats`, `stages`. |
| `createDefaultNormalizer()` | A `Normalizer` with the built-in JSON-family parsers registered. |
| `fhirJsonParser`, `ndjsonParser`, `fhirXmlParser`, `hl7v2Parser` | The built-in adapters. |
| `parseNdjsonStream` | Streaming NDJSON, batch by batch. `fhir-normalize/stream` only. |
| `r4VersionTransform`, `VERSION_MIGRATION`, `FHIR_VERSION` | The cross-version stage, its table, and the release tokens. |
| `validateBundle`, `validateResource` | Structural R4 conformance. `fhir-normalize/validate` only. |
| `simplifyBundle`, `simplifyResource` | The simplified view: choice types resolved, datatypes flattened. |
| `toRows`, `toTables`, `columnsOf` | The simplified view as flat records. `fhir-normalize/simplified` only. |
| `formatShape`, `describeShape`, `listShapes`, `shapeFor` | A resource type's simplified structure, printed or as data. |
| `deIdentifyBundle`, `deIdentifyResource`, `createDeIdentifyTransform` | Structural de-identification: a Bundle, one resource, or a stage. |
| `resolveChoice`, `valueProperties` | One `value[x]` element on its own, and a value kind's property names. |
| `ParseResult`, `FormatParser`, `ResultTransform` | The result shape, the adapter contract, the stage contract. |
| `createParseResult`, `createWarningLog`, `createCollectionBundle` | Helpers for writing an adapter. |
| `FhirNormalizeError`, `UnsupportedFormatError`, `ParseError` | Error types. |
| `RESOURCE_SHAPE`, `REDACT_ELEMENT` | The per-resource field specs, and the elements de-identification removes. |
| `SOURCE_FORMAT`, `BUNDLE_TYPE`, `RESOURCE_TYPE`, `VALUE_KIND`, `LIST_MODE`, `CELL_MODE`, `DATE_POLICY`, `FREE_TEXT_POLICY` | Token constants; the string unions derive from these. |
| `isBundle`, `isBundleType` | Type guards. |

## Playground

**[fhir-normalize-playground.vercel.app](https://fhir-normalize-playground.vercel.app)**

[`playground/`](playground) is a Next.js app running the library in the browser: paste raw data on
the left, watch the standard shape come out on the right, with the detected format, the extracted
resources and the warnings each on a tab. **Rows** is where to try the tabular projection without
writing code — load the `Blood pressure` sample and set explode to `component`.

It imports `fhir-normalize` from the workspace rather than a published build, so the demo cannot
drift from the library.

```bash
pnpm --filter playground dev
```

## Development

A pnpm workspace; the library lives in [`packages/fhir-normalize`](packages/fhir-normalize).

```bash
pnpm install
pnpm verify      # build, lint, knip, typecheck, test — the gate CI runs
```

Release history is in [CHANGELOG.md](CHANGELOG.md), and [CONTRIBUTING.md](CONTRIBUTING.md) is worth
reading first: the shape tables, the cross-version migrations and the generated files are all
checked against vendored copies of the FHIR definitions. Security reports go through
[a private advisory](SECURITY.md), not a public issue.

Releases are tag-driven — pushing `vX.Y.Z` runs the full gate and publishes only if it passes and
the tag matches the package version.

Upgrading from 1.x? Two breaking changes, both covered in
[CHANGELOG.md](CHANGELOG.md): XML moved to its own entry point, and `simplifyResource` returns typed
fields for a typed input.

## License

MIT
