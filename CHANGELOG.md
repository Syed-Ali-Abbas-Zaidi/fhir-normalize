# Changelog

All notable changes to `fhir-normalize`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.5.0] — 2026-08-03

### Added

- **Subpath exports.** `fhir-normalize/simplified` and `fhir-normalize/deidentify` sit alongside
  the root entry, which still re-exports everything for compatibility.
- `FREE_TEXT_ELEMENT` and `surrogateReference` are exported, so the whole de-identification policy
  can be audited rather than half of it.
- `CHANGELOG.md`, which should have existed from `1.0.0`.

### Changed

- **The published package is split into three entry points instead of one.** A single bundle left
  a consumer's bundler nothing to cut along: `sideEffects: false` can drop a whole module but not
  part of one, so anyone who only called `parse()` still shipped all 74 resource shape tables.
  Measured on a real install, library code in a parse-only bundle went from roughly 45 KB to
  **15.4 KB**, and the shape tables no longer appear in it at all.
- `DEID_ACTION` now discriminates the de-identification decision path. It was exported in `1.4.0`
  but referenced nowhere — public API that did nothing.

### Fixed

- `test:coverage` never ran: `@vitest/coverage-v8` was declared in the script but never installed.
  Coverage is now measurable, and is 97.5% of statements and 99.1% of functions.
- Every declared resource shape is now exercised by tests. 74 shapes were declared but only about
  ten were ever executed, so a `display` builder that threw on sparse data would not have been
  caught. None do.

### Known limitations

- `fast-xml-parser` is about 62 KB and is linked by any root import, because
  `createDefaultNormalizer` registers both parsers. Assembling a JSON-only `Normalizer` does not
  currently avoid it.

## [1.4.0] — 2026-08-03

### Added

- **Structural de-identification.** `createDefaultNormalizer({ deIdentify: true })` adds a
  post-parse stage that removes names, telecom, addresses, photos, the rendered narrative, and free
  text; reduces dates to a year; and replaces ids and references with stable surrogates so the
  Bundle still resolves.
- `deIdentifyBundle` and `createDeIdentifyTransform` for use outside the default normalizer.

### Notes

- This is **not** certified HIPAA Safe Harbor or GDPR anonymisation, and surrogates use a
  non-cryptographic hash so they are pseudonyms rather than a one-way seal. Ages over 89 are not
  aggregated and dates are generalized rather than shifted. See the README before releasing data.

## [1.3.0] — 2026-08-03

### Added

- **The whole Base section** of the FHIR resource list — Individuals, Entities, Workflow, and
  Management. 23 new shapes, 74 in total.

### Changed

- **Elements a shape does not declare are now read as well as reported.** Previously their value
  was dropped from `fields` and only the name appeared in `unmapped`. An incomplete shape now costs
  fidelity of interpretation rather than the data itself — which matters because the Base section
  includes resources added after R4.
- Shapes are organised by the spec's own sections: `base.ts`, `clinical.ts`, `foundation.ts`.

## [1.2.0] — 2026-07-31

### Added

- `formatShape`, `describeShape`, and `listShapes` — a resource type's simplified structure as a
  readable tree or a copy-pasteable TypeScript interface, without needing a sample payload.
- `shapeFor` is exported, so alias resolution for `DeviceUsage`, `DeviceAssociation`, and
  `RequestOrchestration` is reachable by consumers.

### Fixed

- The README Status line said `1.0.0`. Both earlier version bumps edited the gitignored prepack
  copy instead of the source, so **the published `1.1.0` README carries the wrong version**. npm
  cannot rewrite a published version, so `1.1.0` stays wrong; `1.2.0` onward is correct.

## [1.1.0] — 2026-07-31

### Added

- **The simplified view.** `simplifyBundle` and `simplifyResource` collapse FHIR choice elements
  onto one key with a `kind` discriminant and a `text` rendering, so `valueQuantity`,
  `valueCodeableConcept`, and `valueString` all arrive as `value`.
- Coverage of the whole Clinical section of the FHIR resource list.
- `Bundle`, `BundleEntry`, and `FhirResource` are re-exported, so consumers can name the output
  without their own `@types/fhir` dependency.

### Known issues

- The README Status line incorrectly reads `1.0.0`. Fixed in `1.2.0`.

## [1.0.0] — 2026-07-31

### Added

- FHIR JSON and FHIR XML adapters behind one `Normalizer` registry, producing a canonical FHIR R4
  `Bundle` whatever the input.
- Cross-version normalization: STU3 and R5 resources are migrated to R4, marker-driven so genuine
  R4 input is returned untouched.
- Warnings rather than exceptions for recoverable gaps; `UnsupportedFormatError` and `ParseError`
  only for input that cannot be read at all.
- Dual ESM + CJS output with generated type declarations.

[1.5.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.5.0
[1.4.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.4.0
[1.3.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.3.0
[1.2.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.2.0
[1.1.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.1.0
[1.0.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.0.0
