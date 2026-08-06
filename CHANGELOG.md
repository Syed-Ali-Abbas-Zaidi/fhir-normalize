# Changelog

All notable changes to `fhir-normalize`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-08-06

Two breaking changes, both of which had been deferred waiting for a major. See
[Migrating from 1.x](README.md#migrating-from-1x) — most projects need one line, or none.

### Changed — breaking

- **XML is no longer registered by default.** The adapter moved to `fhir-normalize/xml`.
  `fast-xml-parser` is ~61 KB and does not declare itself side-effect-free, so while the root module
  imported it, no bundler could drop it — every consumer paid for XML support whether or not they
  used it, four times the size of the library itself.

  **Parsing-only bundles drop from ~77 KB to ~13 KB**, measured with esbuild on real output.
  Restoring XML is one line: `createDefaultNormalizer().register(fhirXmlParser)`. Until it is
  registered, `detectFormat` returns `null` for XML and `parse` throws `UnsupportedFormatError` —
  loud, not silent.

- **`simplifyResource` returns typed fields when the input type is known.** Passing a `Patient`
  yields `PatientFields` rather than a string-indexed map, so `fields.name` is
  `NormalizedName[] | undefined` and `fields.notAThing` is a compile error. A choice narrows to the
  types R4 permits there, which makes `switch (fields.value.kind)` exhaustive.

  Compile-time only — the runtime output is byte-identical. Input whose type is not known
  statically, and `simplifyBundle`, still give the loose map.

### Added

- Per-resource field types — `PatientFields`, `ObservationFields`, … — plus `ResourceFieldMap`,
  `FieldsOf<T>`, `SimplifiedResourceOf<T>` and `PrimitiveValue`. Generated from the shape tables by
  `scripts/generate-field-types.mjs`; a test regenerates them and fails if the committed output
  differs, so they cannot drift from what the code returns.
- `TYPE_SUFFIX_KIND` is exported. It is how `resolveChoice` decides what a suffix means, and the
  generated types are derived from it.
- Type-level tests (`*.test-d.ts`) run as part of `pnpm test`. The generated types are only ever
  wrong at compile time, so nothing else would catch a mistake in them.

### Fixed

- The NDJSON skip warning read "1 line were not valid JSON objects and were skipped". The singular
  case now reads "Line 2 was not a valid JSON object and was skipped."

### Notes

- `dist/index.d.ts` now pulls a ~175 KB declaration chunk, since the root re-exports the simplified
  layer. Types only — no runtime cost — but it is a typecheck cost for consumers who import the
  root and never touch the simplified view. `fhir-normalize/xml` and `/deidentify` are unaffected.

## [1.12.1] — 2026-08-06

### Fixed

- **NDJSON detection failed if either of the first two lines was corrupt.** Parsing skips a bad line
  and reports it, but detection required the first two lines to both be resources — so one bad line
  near the top of an export meant the format was not recognised at all, and `parse` threw
  `UnsupportedFormatError`. That is precisely the case the parser's leniency exists for.

  Detection now looks at the first five non-empty lines and needs two of them to be resources. A
  single JSON resource still goes to the FHIR JSON adapter, and a lone resource followed by junk is
  still not NDJSON.

  Shipped in 1.12.0 because the detection tests only ever used clean input, while the leniency tests
  called the adapter directly and never went through detection.

## [1.12.0] — 2026-08-06

Both additions are for the same workload: a FHIR Bulk Data export, which is NDJSON and is routinely
too large to hold in memory.

### Added

- **NDJSON.** `ndjsonParser` reads newline-delimited JSON — the format `$export` returns — and is
  registered by default. Detection inspects the first two lines rather than the file, so it costs
  nothing on a 62 MB input, and it requires **two or more** resource lines: a single JSON resource
  is legitimately both formats, so the FHIR JSON adapter keeps it. A line that is not a JSON
  resource is skipped and reported in `meta.warnings` rather than failing the whole export.
- **`deIdentifyResource(resource, options)`** — the same pass as `deIdentifyBundle` over a single
  resource, closing the asymmetry with `simplifyResource`, which already existed. Callers reading an
  export a line at a time had to wrap each resource in a Bundle and unwrap the result; on 50,000
  resources that workaround costs 243 ms against 140 ms, plus a discarded Bundle per resource. Both
  paths are asserted to produce identical output.
- The built-in parsers are exported (`fhirJsonParser`, `fhirXmlParser`, `ndjsonParser`) for
  assembling a `Normalizer` by hand.

Streaming a 62 MB export of 200,000 Observations now needs **93 MB of RSS, flat**, against 467 MB to
read and parse it whole.

### Notes

- Parsing-only bundles grow from ~15 KB to ~16 KB for the NDJSON adapter.
- Documented a measurement that turned out to contradict the previous README: **any root import
  links `fast-xml-parser`**, worth ~61 KB, even when the XML adapter is never registered. The root
  module imports it statically and the package is not marked side-effect-free, so bundlers cannot
  drop it. Fixing that means moving the XML adapter behind its own entry point, which changes what
  `createDefaultNormalizer` supports — deferred to a major.

## [1.11.0] — 2026-08-05

### Fixed

- **A choice element accepted any type suffix, including ones R4 does not permit.** A choice is
  resolved from the type encoded in the element name, and that suffix was never checked against the
  element's allowed types. So STU3 `Consent.sourceIdentifier` landed on `source` and R5
  `Observation.valueReference` landed on `value` — presented as conformant R4 when R4 allows neither
  — and `unmapped` stayed empty, so nothing flagged it.

  Every choice now declares the types R4 permits, and a suffix outside them is reported in
  `unmapped` instead. Eight STU3/R5 combinations are affected, on `ConceptMap`, `Condition`,
  `Consent`, `Observation`, `ActivityDefinition`, `PlanDefinition` and `MessageHeader`.

  **This changes behaviour for cross-version input.** If you parse R5 and read
  `fields.value` on an `Observation` carrying `valueReference`, it now appears in `unmapped`
  rather than as a value. That is the point: R4 has nowhere to put it. Pure R4 input is unaffected.

### Added

- `FieldSpec.types` — the FHIR type names a choice accepts. `resolveChoice` and `choiceKeys` take an
  optional `permitted` list to match. Absent means "any known type", which is what a resource with
  no declared shape still gets.
- The conformance suite fails if a choice R4 knows about does not declare its permitted types.
  R4's *open* choices — `Parameters.parameter.value[x]` and `Task.input`/`output.value[x]`, which
  take the whole datatype list — are exempt, since enumerating ~50 types rules out almost nothing.

### Notes

- The simplified view grows from ~77 KB to ~81 KB. Parsing-only bundles stay at ~15 KB.
- This also found that the coverage suite had been probing every choice with a `String` suffix,
  including elements where R4 permits no string. Those probes now use a type the element allows.

## [1.10.1] — 2026-08-05

No behaviour change. The cross-version migration table is now verified rather than trusted, and the
documentation states its real coverage.

### Added

- **`VERSION_MIGRATION` is checked against the STU3, R4 and R5 definitions.** This table rewrites
  clinical data rather than describing it, so a wrong row corrupts a payload silently — it carries
  more risk than the shape tables and had the same provenance. The suite now verifies that every
  migrated field exists in the release it claims, that every target exists in R4, and that no
  unguarded marker is a key a genuine R4 payload could carry. That last one is the property the
  design rests on: migration fires on a marker field because FHIR resources do not record their
  release, so a marker that also exists in R4 would rewrite valid R4 data.

  **All 16 rows and the one resource rename pass.** `Encounter.class` and
  `MedicationRequest.requester` already carry the `applies` guards they need.

- `spec/stu3-keys.json` and `spec/r5-keys.json`, generated alongside the R4 digest by
  `scripts/fetch-r4-spec.mjs`. Committed, and excluded from the published package.

### Documentation

- **The README overstated cross-version support.** It said the canonical shape "holds across
  releases"; measured, the table covers 14 of 794 element differences. 181 STU3 and 599 R5 elements
  are passed through untouched, so a bundle typed as R4 can carry fields that are not R4, and
  nothing in `meta.warnings` says so. The real numbers are now in the README, and the status table
  reads ⚠️ Partial rather than ✅ Supported.
- Documented a known gap in the simplified view: a choice element's type suffix is not checked
  against the types R4 permits, so eight STU3/R5 combinations — `Consent.sourceIdentifier`,
  `Observation.valueReference` among them — are presented as conformant. Pure R4 input is
  unaffected.

## [1.10.0] — 2026-08-05

### Added

- **Every element of every shaped resource is now declared** — 234 that were missing, across 71
  resources, generated from the spec digest and checked by the conformance suite. `Immunization`
  gains `reaction`, `programEligibility` and `fundingSource`; `ExplanationOfBenefit` gains
  `procedure`, `prescription` and `preAuthRef`; `MedicationKnowledge`, `DeviceDefinition`, `Contract`
  and `Task` gain ten or more each. Coverage of the resources the tables shape is 2,302 / 2,302.
- **The conformance suite now fails on any undeclared element**, not just a mandatory one.
- Shared readings for the complex datatypes that recur across sections — `relatedArtifact`,
  `attachment`, `usageContext`, `dataRequirement` — and list variants of `quantity`, `ratio`,
  `range`, `period` and `annotation`.
- The spec digest now records one level inside each backbone element, so a generated `group`
  declares real children rather than an empty object.

### Fixed

- **`unmapped` was suppressing sixteen real elements.** `COMMON_ELEMENT` held `basedOn`, `partOf`,
  `insurance`, `instantiatesCanonical` and a dozen more on the reasoning that they were definitional
  plumbing. They are ordinary elements of particular resources — `basedOn` alone belongs to 20 R4
  resources and was undeclared on six — so suppressing them globally switched off the safety net for
  exactly the fields most likely to be missing. The set is now only what `Resource` and
  `DomainResource` define. On a conforming R4 resource `unmapped` is empty, which makes anything in
  it meaningful.

### Notes

- The simplified view grew from ~48 KB to ~77 KB of library code, the cost of complete coverage.
  **Parsing-only bundles are unchanged at ~15 KB** — verified with a real bundler, not asserted.

## [1.9.0] — 2026-08-05

### Added

- **The shape tables are now checked against the R4 spec.** `spec/r4-elements.json` is a digest of
  the published R4 `StructureDefinition`s, and the suite fails if a shape declares a field R4 does
  not have, disagrees with R4 on whether a field repeats, reads a field as the wrong kind, or omits
  an element R4 makes mandatory. Regenerate the digest with `pnpm --filter fhir-normalize spec:fetch`.
- **`CatalogEntry`, `DocumentManifest`, and `VerificationResult`.** R4 resources that later releases
  dropped; R4 is the canonical target, so a conforming bundle may carry them. 147 shapes in total.

### Fixed

- **53 declared fields did not exist in R4.** The tables were written from the current build of the
  FHIR spec rather than R4, so R5 additions leaked in. A declared field is documentation —
  `describeShape` reports it and consumers model against it — so these read as fields that would
  never be populated. Most came from the shared `canonical` and `reviewed` blocks being spread onto
  resources that lack some of their fields (`identifier` on `CapabilityStatement`, `approvalDate` on
  `CodeSystem`, and so on); `without()` now subtracts what a given resource does not have.
- **`Evidence` and `EvidenceVariable` were modelled on R5.** R5 rebuilt both around
  `variableDefinition`/`statistic`/`certainty`, which are different resources wearing the same name.
  Both are now declared against R4, including the mandatory `Evidence.exposureBackground`.
- **`ConceptMap.identifier` and `TestScript.identifier` were read as lists.** R4 allows one of each,
  so both emitted a single-element array instead of an object.
- **`Media.content` was undeclared** despite being mandatory in R4.
- Removed `AdverseEvent.code`, `MedicationAdministration.encounter`, `ResearchSubject.subject`, and
  `Composition.note` — later-release spellings of elements R4 names differently or does not have.
  The R4 spellings were already declared alongside them.

## [1.8.0] — 2026-08-05

### Added

- **The whole Specialized section** of the FHIR resource list — Public Health & Research,
  Definitional Artifacts, Evidence-Based Medicine, Quality Reporting & Testing, and Medication
  Definition — plus the R4 members the current build dropped: `TestScript`, `TestReport`,
  `ResearchDefinition`, `ResearchElementDefinition`, `EffectEvidenceSynthesis`, and
  `RiskEvidenceSynthesis`. 29 new shapes, 144 in total. **Every section of the resource list is now
  covered in full.**

### Fixed

- **A resource whose name lives in a backbone element had an uninformative label.**
  `MedicinalProductDefinition` and `SubstanceDefinition` read as a bare status code, because the
  label builder could only see top-level fields.

### Notes

- R4's `MedicinalProduct*` and `Substance*` families are deliberately not declared. R5 replaced them
  wholesale with the `*Definition` resources that are covered, and carrying both would double a
  large, rarely-used surface for a modelling approach the spec has abandoned. They still parse and
  still get their choice elements resolved.

## [1.7.0] — 2026-08-04

### Added

- **The whole Foundation section** of the FHIR resource list — Conformance, Terminology, Security,
  Documents, and Other — plus the R4 members the current build dropped or moved: `StructureMap`,
  `GraphDefinition`, `ExampleScenario`, and `Linkage`. 25 new shapes, 115 in total. Every section
  of the resource list except Specialized is now covered in full.

### Notes

- Conformance and terminology resources are largely definitional, so their shapes declare the
  metadata that identifies an artefact rather than the grammar of what it defines. A
  `StructureDefinition`'s element tree and a `ValueSet`'s expansion are data structures in their own
  right; flattening them would lose more than it clarified. They are still read generically and
  reported in `unmapped`.

## [1.6.0] — 2026-08-04

### Added

- **The whole Financial section** of the FHIR resource list — Support, Billing, Payment, and
  General — plus the R4 members the current build dropped or moved: `EnrollmentRequest`,
  `EnrollmentResponse`, `Invoice`, `ChargeItem`, `ChargeItemDefinition`, `Contract`, and
  `InsurancePlan`. 16 new shapes, 90 in total.

### Fixed

- **Money rendered without its currency.** `Money` carries `currency` where `Quantity` carries
  `unit`, so an `ExplanationOfBenefit` total read `1250.5` instead of `1250.5 USD`. Covering the
  Financial section is what surfaced it; clinical quantities are unaffected.

## [1.5.1] — 2026-08-03

Documentation only. No code changed — the source is identical to `1.5.0`. npm cannot update a
package page without a new version, so this exists to get the install instructions published.

### Added

- Install commands for npm, yarn, pnpm, and bun, each verified against the published release
  including the subpath entry points under Yarn Plug'n'Play and pnpm's isolated `node_modules`.
- A note that pnpm 11 holds back very recent releases by default (`minimumReleaseAge`), so
  `pnpm add fhir-normalize` shortly after a release can resolve to the previous version — which,
  before `1.5.0`, means the subpath imports appear not to exist.

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

[1.8.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.8.0
[1.7.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.7.0
[1.6.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.6.0
[1.5.1]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.5.1
[1.5.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.5.0
[1.4.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.4.0
[1.3.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.3.0
[1.2.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.2.0
[1.1.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.1.0
[1.0.0]: https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/releases/tag/v1.0.0
