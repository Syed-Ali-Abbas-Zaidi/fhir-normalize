# fhir-normalize — Design Document

> Package name: `fhir-normalize` (confirmed available on npm, 2026-07-31).

A TypeScript library that ingests healthcare data in multiple formats and returns it in one standard, predictable shape. Publishable to npm, framework-agnostic, zero required runtime config — plus a live playground page to show the transformation.

---

## 1. Problem

Healthcare data arrives in incompatible shapes: FHIR JSON, FHIR XML, different FHIR versions (STU3 / R4 / R5), and — further out — HL7 v2 pipe messages and C-CDA clinical documents. Consumers (apps, pipelines, dashboards) want to write their logic **once** against a single shape, not branch per source.

There are good primitives in the ecosystem (`@types/fhir` for types, `fhirpath` for querying), but no dominant single package that says *"give me any format, I return one clean shape."* That's the gap this library fills.

## 2. Goal

One function surface:

```ts
const { bundle } = normalizer.parse(rawInput); // auto-detects format
```

`bundle` is always the same type regardless of what `rawInput` was. Everything downstream keys off that guarantee.

## 3. Core concept — the universal adapter

Think of a universal power adapter. Every country has a different plug (each input format), but your laptop has one socket (the canonical model). You don't rewire the laptop per country — you add adapters, each of which knows exactly one plug shape and exposes the same output. Adding a new country later is one more adapter and changes nothing else.

Architecturally that's: **canonical model in the middle, pluggable parsers around it** (Adapter + Strategy patterns, with a small registry to route inputs to the right parser).

```
raw input (any format)
      |
      v
  detect format --(or caller specifies)-->  route to matching parser
      |
      v
   parser normalizes  --->  ParseResult { bundle, meta }
```

## 4. Key decision — the "standard shape" is FHIR R4

The canonical model **is FHIR R4**. Every parser normalizes *to* FHIR R4 resources wrapped in a FHIR `Bundle`.

Rationale:

- It's the actual industry standard, so consumers already understand the output — we're not inventing a dialect nobody speaks.
- We get types for free from `@types/fhir` (`fhir/r4`), which is actively maintained and widely depended on.
- High fidelity: we don't silently drop fields we didn't anticipate.

Trade-off: FHIR resources are verbose and deeply nested. To soften that, a **later** optional "simplified view" layer can expose flattened accessors (e.g. `patient.name`, `patient.birthDate`) on top of the canonical bundle — additive, non-breaking, and out of scope for the library v1. (The playground in §8 already ships a preview of this idea via its "Extracted" tab.)

## 5. Public API

```ts
import type { Bundle } from 'fhir/r4';

export type SourceFormat = 'fhir-json' | 'fhir-xml' | 'hl7v2' | 'ccda' | 'csv';

/** The one shape every parser produces. */
export interface ParseResult {
  bundle: Bundle;
  meta: {
    sourceFormat: SourceFormat;
    parsedAt: string;    // ISO timestamp
    warnings: string[];  // non-fatal mapping gaps, never throws
  };
}

/** Adapter contract — one implementation per format (Strategy pattern). */
export interface FormatParser<TRaw = unknown> {
  readonly format: SourceFormat;
  canParse(raw: unknown): boolean;   // used for auto-detection
  parse(raw: TRaw): ParseResult;
}

/** Registry / facade — routes input to the right parser. */
export class Normalizer {
  register(parser: FormatParser): this;
  parse(raw: unknown, format?: SourceFormat): ParseResult;
}

export class UnsupportedFormatError extends Error {}
```

Usage:

```ts
import { Normalizer, fhirJsonParser, fhirXmlParser } from 'fhir-normalize';

const normalizer = new Normalizer()
  .register(fhirJsonParser)
  .register(fhirXmlParser);

// auto-detect
const { bundle, meta } = normalizer.parse(rawInput);

// or force a format
const result = normalizer.parse(rawInput, 'fhir-xml');
```

## 6. Design principles

- **Never throw on recoverable gaps.** Missing/odd fields become `meta.warnings` entries; only genuinely unparseable input throws (`UnsupportedFormatError`, or a parse error from the underlying format).
- **Adapters are independent.** No parser imports another. Adding HL7v2 later touches only `src/parsers/hl7v2/` plus one `register()` call.
- **Auto-detect, but allow override.** `canParse()` powers detection; the optional `format` arg bypasses it for callers who already know.
- **Types are the product.** Strong `.d.ts` output is a first-class deliverable, not an afterthought.
- **No side effects on import.** Consumers construct and register explicitly, so tree-shaking and testing stay clean.

## 7. Scope

### v1 (ship this)

| Format | Effort | Notes |
|---|---|---|
| FHIR JSON | Low | Near-identity map to canonical; mostly validation + version normalization. |
| FHIR XML | Low–Med | Serialization swap via `fast-xml-parser`; we own the FHIR mapping rules. |
| Cross-version (STU3/R4/R5 -> R4) | Med | Genuinely valuable — real systems disagree on version. |
| Core + registry + types + tests | — | The reusable spine everything hangs off. |
| Playground page (§8) | Low–Med | The public demo; also doubles as a manual test harness. |

This alone is a legitimately useful, publishable package.

### Later (additive, non-breaking)

- **HL7 v2** (pipe-delimited messages) — structurally unlike FHIR; mapping is lossy and semantically fiddly. Scope a **single** message type first (e.g. ADT patient admits) as a proof of concept rather than promising full coverage.
- **C-CDA** (clinical XML documents) — large, section-based mapping.
- **CSV / proprietary EHR exports** — schema-driven adapter with a mapping config.
- **Simplified view layer** — ergonomic flattened accessors over the canonical bundle.

The plugin architecture means every item above is an additive change: a new adapter + one `register()` call, no breaking changes to existing consumers.

## 8. Demo / playground

A single page that makes the value obvious in five seconds: paste raw data on the left, watch it come out as the standard shape on the right. It's both a **portfolio showpiece** and a **manual test harness** for the parsers.

**Stack:** Next.js (App Router) — deploys to Vercel in one step, and imports the library directly from the workspace. A prototype (`prototype/Playground.jsx`) already exists and implements the real architecture (adapters + registry), not a mock.

**What it shows:**

- **Format toggle** — `auto` / `json` / `xml`; auto-detection lights up a badge in a `raw -> detect -> normalize -> standard shape` pipeline strip (the page's signature element).
- **Standard shape tab** — the canonical `Bundle`, syntax-highlighted, in a dark "console" panel. The light input / dark output contrast is the transformation, made visual.
- **Extracted tab** — human-readable cards per resource (Patient name/DOB, Observation value+unit, etc.) — a live preview of the future simplified-view layer.
- **Warnings tab** — surfaces the non-fatal mapping gaps, demonstrating the "warn, don't throw" principle.
- **Samples** — one-click Patient / Observation / Bundle / Patient-XML loaders so a visitor sees it working immediately.

**Integration path:** the playground imports `Normalizer` and the parsers from the workspace package, so the demo never drifts from the real library — if a parser changes, the page reflects it.

> The prototype's XML path uses the browser-only `DOMParser`. The shipped library must run in Node too, so the real `fhir-xml` parser uses `fast-xml-parser` instead (see §13).

## 9. Project structure

```
fhir-parser/                          # repo root = pnpm workspace (private)
├── packages/
│   └── fhir-normalize/               # the published package
│       ├── src/
│       │   ├── core/
│       │   │   ├── normalizer.ts     # Normalizer registry / facade
│       │   │   ├── types.ts          # ParseResult, FormatParser, SourceFormat
│       │   │   ├── constants.ts      # SOURCE_FORMAT and other tokens
│       │   │   ├── errors.ts         # UnsupportedFormatError, etc.
│       │   │   ├── bundle.ts         # shared canonical-Bundle helpers
│       │   │   └── result.ts         # ParseResult factory (shared by all parsers)
│       │   ├── parsers/
│       │   │   ├── fhir-json/
│       │   │   ├── fhir-xml/
│       │   │   └── version/          # cross-version normalization helpers
│       │   └── index.ts              # public exports
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts            # dual ESM + CJS build
│       └── vitest.config.ts
├── playground/                       # live demo (Next.js App Router) -> Vercel
├── prototype/Playground.jsx          # original single-file prototype (reference)
├── biome.json
├── package.json                      # workspace root
├── pnpm-workspace.yaml
├── README.md
├── LICENSE                           # MIT
└── DESIGN.md                         # this file
```

The library lives under `packages/` rather than at the repo root so the workspace root can stay `private: true` — a root that is simultaneously the workspace root and the published package fights pnpm.

## 10. Tooling

- **Language:** TypeScript, `strict: true`.
- **Build:** `tsup` — dual ESM + CJS output plus generated `.d.ts`.
- **Test:** `vitest` — fast, TS-native, good for table-driven fixture tests.
- **Lint/format:** Biome (single tool, replaces ESLint + Prettier).
- **Types dependency:** `@types/fhir` (`fhir/r4`) as the canonical type source.
- **XML:** `fast-xml-parser` — isomorphic and actively maintained; we own the FHIR mapping.
- **Playground:** Next.js + Vercel.
- **package.json essentials:**
  - `"type": "module"` with an `exports` map providing both `import` and `require`.
  - `"types"` pointing at generated declarations.
  - `"sideEffects": false` for tree-shaking.
  - `"files": ["dist"]` so only build output is published.

## 11. Testing strategy

- **Fixtures:** real-ish sample payloads per format under `src/parsers/<fmt>/__fixtures__/`.
- **Round-trip / invariant tests:** every parser's output must satisfy "is a valid `Bundle` with the expected resource types."
- **Cross-version tests:** feed STU3 and R5 samples, assert the normalized R4 output matches a canonical snapshot.
- **Detection tests:** assert `canParse()` accepts its own format and rejects others (no false positives across adapters).
- **Warning tests:** malformed-but-recoverable input produces warnings, not throws.
- **Playground as harness:** the demo doubles as an exploratory manual check while developing new adapters.

## 12. Publishing plan

1. `npm login`, confirm final package name is free.
2. Build with `tsup`, verify `dist/` has ESM, CJS, and `.d.ts`.
3. `npm publish`.
4. GitHub repo with README (badges, quickstart, format-support table, link to the live playground), MIT license, CI running `test` + `build` on PRs.
5. Deploy `playground/` to Vercel; link it from the README and npm page.
6. Semantic versioning: v1 starts at `0.1.0` while the API firms up, `1.0.0` once stable.

## 13. Decisions — confirmed 2026-07-31

- **Canonical version:** **R4**. Best-supported, best-typed, what consumers expect.
- **XML:** **`fast-xml-parser`**, mapping owned in-repo. `FHIR.js` was the original candidate but is abandoned — `fhir.js@0.0.22`, last published 2022. The maintained `fhir` package (v4.12.0) was considered and rejected as too heavy and Node-leaning for a library the playground also bundles.
- **Async vs sync `parse()`:** **sync for v1.** Simpler, and nothing in scope needs I/O. A future async parser can be introduced as a separate `parseAsync` surface without breaking callers.
- **Repo layout:** **pnpm workspace**, library under `packages/fhir-normalize` (see §9).
- **Package name:** **`fhir-normalize`**, unscoped.

## 14. Next steps

1. ~~Confirm the open questions in §13.~~ Done.
2. Scaffold the repo per §9 (`package.json`, `tsconfig`, `tsup`, `vitest`, folder tree, workspace).
3. Implement `core/` (Normalizer, types, errors) + `fhir-json` parser + tests as the first vertical slice.
4. Add `fhir-xml` and cross-version normalization.
5. Wire the `playground/` Next.js app to import from the library (port the `Playground.jsx` prototype to `app/page.tsx`).
6. Wire CI, write README, deploy the playground, publish `0.1.0`.
