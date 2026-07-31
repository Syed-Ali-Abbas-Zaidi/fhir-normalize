# fhir-normalize

Ingest healthcare data in several formats and get back **one standard shape**: a FHIR R4 `Bundle`.

Write your downstream logic once, against one type, instead of branching per source system.

```ts
import { createDefaultNormalizer } from 'fhir-normalize';

const normalizer = createDefaultNormalizer();
const { bundle, meta } = normalizer.parse(rawInput); // format auto-detected

bundle.entry?.forEach((entry) => console.log(entry.resource?.resourceType));
console.log(meta.sourceFormat, meta.warnings);
```

`bundle` is a `Bundle` from [`@types/fhir`](https://www.npmjs.com/package/@types/fhir) — the real
industry standard, not a bespoke dialect.

## Status

Early. `0.1.0`, API still firming up.

| Format | Status |
| --- | --- |
| FHIR JSON (resource, Bundle, or array) | ✅ Supported |
| FHIR XML | ✅ Supported |
| Cross-version STU3 / R5 → R4 | 🚧 Planned |
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
| `Normalizer` | The registry. `register()`, `parse()`, `detectFormat()`, `formats`. |
| `createDefaultNormalizer()` | A `Normalizer` with all built-in parsers registered. |
| `fhirJsonParser`, `fhirXmlParser` | The built-in adapters. |
| `ParseResult` | `{ bundle, meta: { sourceFormat, parsedAt, warnings } }`. |
| `FormatParser` | The adapter contract to implement for a new format. |
| `FhirNormalizeError`, `UnsupportedFormatError`, `ParseError` | Error types. |
| `createParseResult`, `createWarningLog`, `createCollectionBundle` | Helpers for writing an adapter. |
| `SOURCE_FORMAT`, `BUNDLE_TYPE`, `RESOURCE_TYPE` | Token constants; the string unions derive from these. |
| `isBundle`, `isBundleType` | Type guards. |

## Development

This repo is a pnpm workspace. The package lives in [`packages/fhir-normalize`](packages/fhir-normalize).

```bash
pnpm install
pnpm test        # vitest
pnpm typecheck   # tsc --noEmit
pnpm lint        # biome
pnpm build       # tsup -> dual ESM + CJS + .d.ts
```

The canonical model is FHIR R4, and every format is normalized to it by an independent adapter
behind a single registry, so adding a format never changes existing code.

## License

MIT
