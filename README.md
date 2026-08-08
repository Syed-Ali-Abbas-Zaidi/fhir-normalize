# fhir-normalize

[![npm](https://img.shields.io/npm/v/fhir-normalize.svg)](https://www.npmjs.com/package/fhir-normalize)
[![CI](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/actions/workflows/ci.yml/badge.svg)](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/fhir-normalize.svg)](LICENSE)

Ingest healthcare data in several formats and get back **one standard shape**: a FHIR R4 `Bundle`.

Write your downstream logic once, against one type, instead of branching per source system.

**[Try it in the playground →](https://fhir-normalize-playground.vercel.app)** — paste JSON, XML,
NDJSON, or an STU3 resource and watch what comes out.

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

`2.2.1`. The public surface — `ParseResult`, `FormatParser`, `ResultTransform`, and the `Normalizer`
methods — is stable under semver; anything breaking lands in a major.

| Format | Status |
| --- | --- |
| FHIR JSON (resource, Bundle, or array) | ✅ Supported |
| FHIR XML | ✅ Supported (opt in via `fhir-normalize/xml`) |
| NDJSON (Bulk Data `$export`) | ✅ Supported |
| Cross-version STU3 / R5 → R4 | ⚠️ Partial (14 curated differences — [see coverage](#older-and-newer-releases-land-on-r4)) |
| Simplified view (choice types resolved) | ✅ Supported (every section, 147 types) |
| Flat rows out, for CSV and tabular loads | ✅ Supported (via `fhir-normalize/simplified`) |
| De-identification | ✅ Supported (structural; see the limits below) |
| HL7 v2, C-CDA, CSV **in** | 📋 Later |

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

The package has four entry points. The root re-exports the JSON-family parsers and the simplified
and de-identify layers, so a single import still works; the subpaths let a bundler leave out what
you do not use.

```ts
import { createDefaultNormalizer } from 'fhir-normalize';              // parsing
import { simplifyBundle, formatShape, toRows } from 'fhir-normalize/simplified';
import { deIdentifyBundle } from 'fhir-normalize/deidentify';
import { fhirXmlParser } from 'fhir-normalize/xml';                    // opt in
```

`toRows` is the one export the root does not re-export: it serves the `/simplified` subpath only,
so it costs nothing to anyone who does not project the simplified view into a table.

The 147 resource shape tables are the bulk of the library, and they only ship if you import from
`/simplified`. Measured on a real install, minified:

| What you import | Bundled |
| --- | --- |
| parsing only | **~13 KB** |
| parsing + the simplified view | ~78 KB |
| parsing + XML | ~77 KB |

These are what a bundler actually emits, `fast-xml-parser` included — not library code with the
dependency excluded.

The simplified view grew in 1.10.0, when the tables went from partial to complete coverage of every
element of every resource they shape, and again in 1.11.0 with the permitted types on each choice.
Parsing-only bundles are unaffected.

**XML lives at `fhir-normalize/xml` and is not registered by default.** `fast-xml-parser` is ~61 KB
and does not declare itself side-effect-free, so while the root module imported it, every consumer
linked it whether or not they parsed XML — four times the size of the library. Adding it back is one
line:

```ts
import { createDefaultNormalizer } from 'fhir-normalize';
import { fhirXmlParser } from 'fhir-normalize/xml';

const normalizer = createDefaultNormalizer().register(fhirXmlParser);
```

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

### Bulk Data exports, one resource at a time

FHIR Bulk Data (`$export`) returns NDJSON — one resource per line, routinely hundreds of megabytes.
Handed the whole string, the NDJSON adapter reads it like any other format:

```ts
normalizer.parse(await readFile('Observation.ndjson', 'utf8'));
// -> meta.sourceFormat: 'ndjson', one collection Bundle
```

Detection is cheap — it inspects the first few lines, not the file — and requires **two or more**
resource lines among them, so a single JSON resource still goes to the FHIR JSON adapter while a
corrupt line near the top does not make the export undetectable. A line that is not a JSON resource
is skipped and reported in `meta.warnings` rather than failing the export.

For a file too large to hold in memory, work line by line. Every piece of the library has a
per-resource entry point, so nothing needs the whole set at once:

```ts
import { createInterface } from 'node:readline';
import { createDefaultNormalizer, SOURCE_FORMAT } from 'fhir-normalize';
import { simplifyResource } from 'fhir-normalize/simplified';
import { deIdentifyResource } from 'fhir-normalize/deidentify';

const normalizer = createDefaultNormalizer();

for await (const line of createInterface({ input: createReadStream(path) })) {
  if (!line) continue;

  const { bundle } = normalizer.parse(JSON.parse(line), SOURCE_FORMAT.FHIR_JSON);
  const { resource } = deIdentifyResource(bundle.entry![0]!.resource!);

  await sink.write(simplifyResource(resource));
}
```

Measured on a 62 MB export of 200,000 Observations: **467 MB of RSS** reading and parsing the whole
file, against **93 MB** streaming it — and the streaming figure is flat, so it does not change when
the file does.

### Older and newer releases land on R4

Known STU3 and R5 differences are migrated to R4 automatically:

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

**Every row is checked against the published definitions.** The suite verifies that each migrated
field really exists in the release it claims, that each target really exists in R4, and — the one
that matters most — that no unguarded marker is a key a genuine R4 payload could carry. Migration is
marker-driven, so a marker that also exists in R4 would rewrite valid R4 data. `Encounter.class` and
`MedicationRequest.requester` need `applies` guards for exactly that reason.

**The table is curated, and it is small.** Measured against the definitions:

| | Elements differing from R4 | Migrated | Passed through unchanged |
| --- | --- | --- | --- |
| STU3 → R4 | 193 | 12 | 181, across 69 resources |
| R5 → R4 | 601 | 2 | 599, across 102 resources |

It covers Observation, Condition, Procedure, Communication, CarePlan, MedicationRequest, Patient,
Encounter and DocumentReference. Everything else is **passed through untouched** — so a bundle
typed as R4 can still carry fields that are not R4, and today nothing in `meta.warnings` says so.

This is deliberate as far as it goes: a wrong migration corrupts clinical data silently, so
differences that aren't certain are left alone rather than guessed at. But "left alone" currently
also means "unreported". If that matters to you, `simplifyResource().unmapped` names every field
that is not an element of the resource in R4 — see [the simplified view](#one-predictable-shape-per-resource).

Inspect or extend the table via the exported `VERSION_MIGRATION`.

Fields it passes through are still visible in the simplified view: a choice element only accepts a
type R4 permits, so STU3 `Consent.sourceIdentifier` and R5 `Observation.valueReference` are reported
in `unmapped` rather than presented as a conformant `source` or `value`.

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

**The fields are typed per resource.** Pass a typed resource and `simplifyResource` infers which
fields exist and what each one is, from the same tables that do the work at runtime:

```ts
import type { Observation } from 'fhir/r4';   // re-exported by @types/fhir, already a dependency
import { simplifyResource } from 'fhir-normalize/simplified';

const { fields } = simplifyResource(observation);

fields.code.text;        // string      — code is a CodeableConcept
fields.performer[0].id;  // string|null — performer is a Reference list
fields.value;            // the nine types R4 permits on Observation.value[x],
                         // so `switch (fields.value.kind)` is exhaustive
fields.notAThing;        // compile error
```

The types are generated from the shape tables, and a test regenerates them and fails if the
committed output differs — so they cannot drift from what the code returns. Name one directly as
`ObservationFields`, or look it up with `FieldsOf<'Observation'>`. Input whose type is not known
statically still gets the loose map, so `simplifyResource(JSON.parse(text))` behaves as before.

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

**Coverage: every section of the [FHIR resource list](https://build.fhir.org/resourcelist.html) in
full** — Foundation, Base, Clinical, Financial, and Specialized — plus the R4 members the current
build renamed or dropped. That is 147 resource types. A test transcribes each section list and
fails if any entry loses its shape.

**Every declared field is checked against the R4 spec.** The shapes are diffed against the
`StructureDefinition`s published at [hl7.org/fhir/R4](https://hl7.org/fhir/R4/definitions.json.zip),
and the suite fails if a shape declares a field R4 does not have, gets a field's cardinality wrong,
or reads a field as the wrong kind. A declared field is documentation — `describeShape` reports it
and you build against it — so it has to be a field that exists.

One family is deliberately absent: R4's `MedicinalProduct*` and `Substance*` resources, which R5
replaced wholesale with the `*Definition` resources that are covered. They still parse and still get
their choice elements resolved; they simply have no curated field ordering.

Resource types renamed across releases resolve through an alias, so `DeviceUsage` (R5) and
`DeviceAssociation` (R6) both land on the R4 `DeviceUseStatement` shape.

**Every element of every shaped resource is declared** — all 2,302 of them, asserted against the
spec digest. So `unmapped` is now a real signal: on a conforming R4 resource it is empty, and
anything in it is an extension, a field from another release, or a typo.

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

### Flat rows, for CSV and for tables

Analytics is one of the main reasons to normalize FHIR, and a flat table is what most downstream
tools want. The simplified view has already done the hard part, so `toRows` is the mechanical last
step — one row per resource, one column per field, cells a CSV writer or a database driver takes
as they are:

```ts
import { simplifyBundle, toRows } from 'fhir-normalize/simplified';

const rows = toRows(simplifyBundle(bundle));
// [{ resourceType: 'Observation', id: 'obs-1', code: 'Body Weight', value: '74.5 kg', … }]
```

A cell is `string | number | boolean | null` and nothing else. **No CSV text is emitted**: quoting,
escaping, and encoding are solved problems, and rows hand off to whichever library already solved
them.

**Columns are stable per resource type.** Every Observation row carries the same keys in the same
order as every other Observation row, with `null` where a value is absent — so a writer cannot
produce ragged output. A Patient row keeps Patient columns: one table spanning both would be mostly
empty cells. `columnsOf(rows)` gives the header, and `toTables` returns a table each:

```ts
import { columnsOf, toTables } from 'fhir-normalize/simplified';

const tables = toTables(simplifyBundle(bundle));   // { Patient: [...], Observation: [...] }
columnsOf(tables.Observation);                     // ['resourceType', 'id', 'display', 'status', …]
```

**Column names join with `_`.** FHIR element names are `[A-Za-z0-9]+`, so an underscore cannot
occur inside one and a name always splits back into its parts — and it is the one separator that is
a legal unquoted SQL identifier character. Nesting reads left to right:
`component_0_value_unit` is `component[0].value.unit`.

**Repeating elements** default to the first entry, with a `_count` column saying how many there
were, so the loss is visible rather than silent. Two other treatments are an option away:

| Options | `Patient.name` becomes | Grain |
| --- | --- | --- |
| *(default)* | `name`, `name_count` | one row per resource |
| `{ lists: 'index' }` | `name_0`, `name_1`, … | one row per resource |
| `{ explode: 'name' }` | `name`, `name_index`, `name_count` | one row per name |

`explode` names **one** field, not several: exploding two lists at once produces their cross
product, which is not a grain anyone asked for. A resource without that field still produces its
one row, so nothing drops out of the table. This is the answer to the blood pressure Observation —
`{ explode: 'component' }` gives a row for systolic and a row for diastolic, with the code, subject,
and date duplicated onto each.

**Backbone elements** flatten under their own prefix, following the same `lists` rule:
`component_code` and `component_value` by default, `component_0_code` when indexed. Groups nested
inside groups keep nesting — `component_referenceRange_low`.

**What lands in a cell** is `text` by default — the rendering every normalized value carries, which
is simple and lossy. Ask for `typed` cells when you want the code rather than its display name, or
the magnitude rather than its rendering:

```ts
toRows(resources, { cells: 'typed' })[0];
// { code: 'Body Weight', code_kind: 'concept', code_code: '29463-7',
//   code_system: 'http://loinc.org', code_display: 'Body Weight',
//   value: '74.5 kg', value_kind: 'quantity', value_value: 74.5, value_unit: 'kg', … }
```

| Cells | Columns for `Observation.code` | Columns for `Observation.value` |
| --- | --- | --- |
| `text` | `code` | `value` |
| `typed` | `code`, and one per property of the value's kind | `value`, and one per property of whichever kind the choice resolved to |

Typed cells are a superset: every text column is still there, joined by the value's own properties
and a `_kind` column, so a choice element can be read back. Numbers stay numbers and booleans stay
booleans. Values nested in values flatten too — a Range gives `value_low_value` and
`value_high_value`. Repeating primitives join into one cell: `name_given` is `Ali | Reza`. The one
property a cell cannot hold is a CodeableConcept's alternate `codings`, whose primary entry is
already flattened onto `code`, `system`, and `display`; reach for the simplified view if you need
the rest.

Two smaller rules, both about honesty:

- A value that renders as the em-dash placeholder becomes `null`. The placeholder is a display
  affordance — a table has a real empty cell where a page does not.
- An element the shape does not declare still gets a column. With `typed` cells an object-valued
  one is serialized as JSON rather than dropped, the same way `unmapped` keeps it visible.

**This lives on the `fhir-normalize/simplified` subpath only**, not on the root entry point, so it
costs nothing to anyone who does not ask for it: a bundle built against the root export is
byte-for-byte the size it was before this existed.

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

The same reasoning covers the forms an identifier takes under a different name. `Location.position`
goes with `Location.address`, since latitude and longitude fix a building more precisely than the
street does. `Device.udiCarrier` goes with `Device.serialNumber`, because the carrier string repeats
the serial. `Attachment.data` and `Binary.data` go because a scanned letter is prose that happens to
be base64, and `Attachment.title` goes with it — while `title` on the 33 resources where it names an
artefact is kept, told apart by structure like the two `display`s.

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
what changed. `deIdentifyResource(resource, options)` is the same pass over a single resource, for
callers reading an export a line at a time — identical output, and no throwaway Bundle per resource.

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

## Migrating from 1.x

Two breaking changes. Most projects need one line, or none.

**1. XML is no longer registered by default.** `fast-xml-parser` is ~61 KB and cannot be
tree-shaken, so importing it from the root cost every consumer four times the size of the library —
including the majority who never parse XML. Parsing-only bundles drop from ~77 KB to ~13 KB.

```diff
  import { createDefaultNormalizer } from 'fhir-normalize';
+ import { fhirXmlParser } from 'fhir-normalize/xml';

- const normalizer = createDefaultNormalizer();
+ const normalizer = createDefaultNormalizer().register(fhirXmlParser);
```

If you do not parse XML, do nothing. `detectFormat` returns `null` for XML until the adapter is
registered, and `parse` throws `UnsupportedFormatError` — both loud, neither silent.

**2. `simplifyResource` returns typed fields for a typed input.** Passing a `Patient` gives you
`PatientFields` instead of a string-indexed map. This is only a compile-time change — the runtime
output is byte-identical — but it will surface real mistakes:

```ts
const { fields } = simplifyResource(patient);

fields.name;        // NormalizedName[] | undefined — was a three-way union
fields.notAThing;   // now a compile error
```

Two things to know. A field is optional, because a resource need not carry it — so `fields.name` is
possibly `undefined` where before it was a union you had to narrow anyway. And indexing with a
computed key no longer typechecks; if you need that, widen explicitly:

```ts
const loose: SimplifiedFields = fields;
loose[someKey];
```

Nothing changes for input whose type is not known statically. `simplifyResource(JSON.parse(text))`
and `simplifyBundle(bundle)` both still give the loose map, because a Bundle's entries are
heterogeneous and there is nothing to infer from.

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
| `toRows`, `toTables`, `columnsOf` | The simplified view as flat records, for CSV and tabular loads. `fhir-normalize/simplified` only. |
| `LIST_MODE`, `CELL_MODE` | Row option tokens: how repeating elements become columns, and what lands in a cell. |
| `fhirJsonParser`, `fhirXmlParser`, `ndjsonParser` | The built-in format adapters, registerable on your own `Normalizer`. |
| `resolveChoice` | Resolves one `value[x]`-style element on its own. |
| `formatShape`, `describeShape`, `listShapes` | The simplified structure of a resource type, printed or as data. |
| `shapeFor`, `valueProperties` | Shape lookup with alias resolution, and a value kind's property names. |
| `deIdentifyBundle`, `deIdentifyResource`, `createDeIdentifyTransform` | Structural de-identification: a Bundle, one resource, or a pipeline stage. |
| `DATE_POLICY`, `FREE_TEXT_POLICY`, `REDACT_ELEMENT` | De-identification policy tokens and the redact list. |
| `RESOURCE_SHAPE`, `VALUE_KIND` | The per-resource field specs and the value-kind tokens. |
| `ParseResult` | `{ bundle, meta: { sourceFormat, parsedAt, warnings } }`. |
| `FormatParser` | The adapter contract to implement for a new format. |
| `FhirNormalizeError`, `UnsupportedFormatError`, `ParseError` | Error types. |
| `createParseResult`, `createWarningLog`, `createCollectionBundle` | Helpers for writing an adapter. |
| `SOURCE_FORMAT`, `BUNDLE_TYPE`, `RESOURCE_TYPE` | Token constants; the string unions derive from these. |
| `isBundle`, `isBundleType` | Type guards. |

## Playground

**[fhir-normalize-playground.vercel.app](https://fhir-normalize-playground.vercel.app)**

[`playground/`](playground) is a Next.js app that runs the library in the browser: paste raw data
on the left, watch it come out as the standard shape on the right, with the detected format, the
extracted resources, and the warnings each on their own tab.

**Rows** is where to try the tabular projection without writing any code: it renders a table per
resource type, with `lists`, `cells`, and `explode` as controls, and copies any table out as CSV.
Load the `Blood pressure` sample and set explode to `component` to watch one Observation become a
row for systolic and a row for diastolic.

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

Release history is in [CHANGELOG.md](CHANGELOG.md). Before opening a pull request, read
[CONTRIBUTING.md](CONTRIBUTING.md): the shape tables, the cross-version migrations, and two
generated files are all checked against vendored copies of the FHIR definitions, and knowing that
saves arguing with a test that is right.

Security reports go through [a private advisory](SECURITY.md), not a public issue.

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
