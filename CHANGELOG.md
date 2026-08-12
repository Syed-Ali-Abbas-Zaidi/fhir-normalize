# Changelog

All notable changes to `fhir-normalize`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [2.7.0] — 2026-08-12

### Added

- **The R5 → R4 direction went from 2 rows to 21**, aimed at the resource types a real export
  carries. On an R5 bundle covering the migrated elements, `validateBundle` went from reporting
  **14 elements R4 does not define to one** — `Coverage.kind`, an R5 invention with no R4
  counterpart, deliberately passed through.

  | Resource | Now handled |
  | --- | --- |
  | `Procedure` | `occurrence[x]` → `performed[x]` for dateTime, Period, string, Age and Range |
  | `Encounter` | `actualPeriod` → `period`, `admission` → `hospitalization`, `reason` split |
  | `MedicationStatement` | `encounter` → `context`, `medication` → `medication[x]`, `reason` split |
  | `MedicationRequest` | `reported` → `reportedBoolean`, `reason` split |
  | `Immunization` | `informationSource` → `reportOrigin`, `reason` split |
  | `DiagnosticReport` | `study` → `imagingStudy` |
  | `Coverage` | `insurer` → `payor`, wrapped in the list R4 requires |
  | `Location` | `form` → `physicalType` |
  | `Observation` | `valueReference` and `valueAttachment` reported |

  R5 replaced `reasonCode` and `reasonReference` with one `reason` list of `CodeableReference`;
  splitting it back is one converter shared by four resources. `Encounter` needed its own, because
  R5 wraps that list in a backbone carrying a `use` that has no R4 home.

  Elements R5 invented and R4 never had — `Encounter.virtualService`,
  `MedicationStatement.adherence`, `Observation.triggeredBy` — pass through rather than being
  deleted, and `fhir-normalize/validate` names each one with its path. `Observation.valueReference`
  and `valueAttachment` are the exception: a choice element carrying a type R4 forbids makes the
  resource wrong rather than merely extended, so those are dropped and reported.

- **Every migration is now applied to every resource the definitions say it fits**, rather than to
  the resource types someone thought to list. The table went from 58 rows across 15 resource types
  to **99 across 34**, without a single new converter: `reason` fits eighteen resources and was
  wired to five, STU3 `context` fits seventeen and was wired to six.

  On bundles covering the newly wired resources, `validateBundle` went from **10 elements R4 does
  not define to none**, for both STU3 and R5 input.

  A conformance check now holds this: adding a row for one resource fails the suite until every
  other resource the pattern fits is covered, or listed as a deliberate exception with the reason it
  cannot be verified. Three exceptions are recorded, all because the digests carry element types and
  cardinality and never value-set bindings — `notDone` and `notGiven` write a `status`, and R4 binds
  that to a different value set per resource.

- **`spec/stu3-elements.json`, and two more conformance checks.** The STU3 and R5 digests held
  payload keys only, which cannot say whether a rename changes an element's cardinality. Both
  releases now have full element digests, and the suite checks that a plain rename joins elements of
  the same cardinality — which immediately caught `ImagingStudy.reason`, `0..1` in STU3 and a list in
  R4, being renamed without being wrapped. A rewrite now declares the fields it writes, so those can
  be checked against R4 too.

- **`spec/r5-elements.json`.** The R5 digest held payload keys only, which cannot say whether
  renaming an R5 backbone onto an R4 one carries children R4 does not define. It can now:
  `Encounter.admission` → `hospitalization` was confirmed safe because R5's children are a subset
  of R4's, rather than assumed to be.

### Fixed

- **Three rows were competing for a field two releases both use.** `Encounter.reason`,
  `Appointment.reason` and `ImagingStudy.reason` exist in STU3 as a `CodeableConcept` list and in R5
  as something else, and the stage applies rows in order, so the first claimed the field for both
  releases. Each R5 row is now guarded on the shape it recognises.

- **Two rows were competing for `Encounter.reason`.** STU3 has a `CodeableConcept` list there and
  R5 a backbone, and the stage applies rows in order, so the first claimed the field for both
  releases — an R5 payload came out with the raw backbone sitting in `reasonCode`. The R5 row is
  now guarded on the shape it recognises. The conformance suite gained a check for this class:
  two rows may share a source only if all but one can tell their own shape apart.

## [2.6.0] — 2026-08-12

### Added

- **`fhir-normalize/hl7v2` — HL7 v2 messages in, a FHIR R4 Bundle out.** The format most hospital
  interfaces still speak. Opt in and register it, the way XML works:

  ```ts
  import { createDefaultNormalizer } from 'fhir-normalize';
  import { hl7v2Parser } from 'fhir-normalize/hl7v2';

  const { bundle, meta } = createDefaultNormalizer().register(hl7v2Parser).parse(adtMessage);
  ```

  | Segment | Becomes |
  | --- | --- |
  | `PID` | `Patient` |
  | `PV1` | `Encounter` |
  | `OBX` | `Observation`, with the `value[x]` that `OBX-2` asks for |
  | `AL1` | `AllergyIntolerance` |
  | `DG1` | `Condition` |

  A curated subset, not the v2-to-FHIR implementation guide. Every other segment is skipped and
  named in `meta.warnings`, so a message is never quietly half-read. The first `PID` becomes the
  subject of every other resource in the message.

  Where v2 says something R4 cannot express, the element is left out and the loss reported rather
  than guessed at. A timestamp with no UTC offset is the sharpest case: R4's `dateTime` requires a
  timezone once hours are present, so the date is kept and the time dropped — assuming UTC would be
  a twelve-hour error for half the world.

  Hexadecimal escapes (`\Xdddd\`) are decoded as UTF-8 rather than one character per byte, so a
  name outside ASCII survives — `\XC3A9\` is `é`, not `Ã©`.

  A timestamp whose numbers are not a real moment — month 13, minute 60, an offset past ±14:00, the
  29th of February in a year that has none — is reported and dropped rather than serialised into a
  date R4 would refuse. Segments R4 will not accept without a patient (`AL1`, `DG1`) are skipped and
  named when the message has no `PID`, rather than emitted without the required element.

  Adds ~9 KB to a bundle that already parses, and nothing to one that does not import it.

### Changed

- **The bundle-size table was re-measured.** Parsing-only is ~16 KB, not the ~13 KB the README
  claimed: widening the migration table in 2.5.0 grew it, and `createDefaultNormalizer` registers
  that stage. The figure should have moved in that release and did not.

## [2.5.0] — 2026-08-12

### Added

- **Cross-version migration widened from 14 rows to 39**, aimed at the resource types that actually
  appear in a real export rather than at the raw element count. On a realistic STU3 bundle,
  `validateBundle` went from reporting **14 non-R4 elements to none**:

  | Resource | Now handled |
  | --- | --- |
  | `Condition`, `AllergyIntolerance` | `assertedDate` → `recordedDate` |
  | `Procedure` | `notDone` → `status: "not-done"`, `notDoneReason` → `statusReason`, `definition` reported |
  | `Immunization` | `date` → `occurrenceDateTime`, `practitioner` → `performer`, `notGiven` → status, `explanation` split into `reasonCode` and `statusReason`, `vaccinationProtocol` → `protocolApplied` |
  | `DiagnosticReport` | `context` → `encounter`, `codedDiagnosis` → `conclusionCode`, `image` → `media` |
  | `Coverage` | `sequence` → `order` as a `positiveInt`, `grouping` reported |
  | `Encounter` | `reason` → `reasonCode` |
  | `Observation` | `valueAttachment` reported |
  | `MedicationStatement` | `taken` and `reasonNotTaken` reported |
  | `DocumentReference` | `created` reported |
  | `CarePlan`, `MedicationRequest` | `definition` reported |

  `notDone` and `notGiven` are the rows that matter most. STU3 recorded "this did not happen" in a
  boolean beside the status; R4 removed both and added `not-done` to the status value set. Dropping
  them would have delivered a payload saying a vaccine was *not* given as one saying it was, so
  `true` now overwrites the status — which is safe precisely because the STU3 status cannot have
  said `not-done`, a code that postdates it.

  Ten of the rows report and drop rather than migrate, because R4 has nowhere to put the element and
  a guess written into clinical data is worse than a documented loss. Where a value cannot be
  expressed conformantly — a `Coverage.sequence` of `"1a"` where R4 wants a `positiveInt`, a
  performer with no actor where R4 requires one — the element is dropped and the warning says so
  rather than writing something invalid.

  The coverage figures the README quotes are now asserted against `VERSION_MIGRATION` and the spec
  digests by a test, rather than counted by hand. They had been miscounted twice.

### Fixed

- **`MedicationStatement.context` is no longer treated as the `context` → `encounter` rename.** R4
  kept `context` on that resource and has no `encounter` element, so the rename its neighbours get
  does not apply. Caught by checking each target against the digest instead of following the
  pattern.

## [2.4.0] — 2026-08-11

### Added

- **`fhir-normalize/stream` — NDJSON input that is not limited by the size of a string.** A
  JavaScript string cannot exceed 512 MB, so a Bulk Data `$export` past that could not be given to
  `parse()` at all, and well below it the file, its lines and the decoded resources were all live
  at once. `parseNdjsonStream` reads the source a chunk at a time and yields a normal `ParseResult`
  every `batchSize` resources:

  ```ts
  import { createReadStream } from 'node:fs';
  import { createDefaultNormalizer } from 'fhir-normalize';
  import { parseNdjsonStream } from 'fhir-normalize/stream';

  const options = { batchSize: 1000, normalizer: createDefaultNormalizer() };

  for await (const { bundle, meta } of parseNdjsonStream(createReadStream(path), options)) {
    await db.insertMany(bundle.entry ?? []);
  }
  ```

  Measured against two synthetic exports of Observations:

  | Export | `parse()` | `parseNdjsonStream()` |
  | --- | --- | --- |
  | 250 MB, 800,101 resources | 2.0 s, 1,271 MB peak RSS | 1.4 s, 157 MB |
  | 700 MB, 2,235,902 resources | `ERR_STRING_TOO_LONG` | 3.6 s, 192 MB |

  Each batch is exactly what `parse()` returns, so `simplifyBundle`, `validateBundle` and `toRows`
  take it unchanged, and a `normalizer` passed in runs its registered stages over every batch. The
  source is any `AsyncIterable<string | Uint8Array>`, so a Node `Readable`, a web `ReadableStream`
  and an async generator all work. NDJSON only — a single enormous JSON or XML document needs an
  incremental parser, which this is not.

  A line longer than `maxLineLength` (32 MB by default) is refused rather than decoded, whether it
  arrives whole in one chunk or accumulates across many, because `JSON.parse` on an enormous line is
  the spike the limit exists to prevent.

  Adds ~1.6 KB to a bundle that already parses, and nothing to one that does not import it.

- **`Normalizer.applyTransforms`.** Runs the registered post-parse stages over a result an adapter
  has already produced. `parse()` uses it internally; it is public so streaming drives the same
  pipeline rather than a second copy of it that could drift.

## [2.3.2] — 2026-08-11

### Fixed

- **A string element that arrived as an object rendered as the literal `[object Object]`.** The
  simplified view coerces a value to text when R4 declares a string and something else turns up,
  which is right for a number or a boolean and wrong for everything else:

  ```text
  { resourceType: 'Observation', status: 'final', valueString: { nested: 'x' } }
  before -> { kind: 'string', text: '[object Object]', value: '[object Object]' }
  after  -> { kind: 'string', text: '—',               value: '' }
  ```

  Malformed input is the case this library exists for, and rendering nonsense as though it were
  data is a worse failure than admitting there is nothing readable. Coercion is now limited to the
  primitives that have a meaningful string form; anything else reads as absent, the way it already
  did for `null`.

- **`normalizeByKind` threw a `TypeError` for a kind it has no reader for.** Unreachable with types
  — the parameter is a `ValueKind` — but reachable from JavaScript, and from anything bridging
  `FieldKind`, four of whose members are not `ValueKind`s. It now returns the unknown value, which
  is what the rest of the library does instead of throwing.

  The lookup is an own-property check rather than a plain one, so a key inherited from
  `Object.prototype` cannot resolve to something that is not a reader: `constructor` would
  otherwise return the input unchanged and `toString` would answer `'[object Undefined]'`, both
  silently.

## [2.3.1] — 2026-08-09

### Fixed

- **XML parsing inferred cardinality from a hand-written list of thirty element names.** R4 makes
  483 element names `0..*`, so 460 of them were unknown: a lone `<jurisdiction>` came back as an
  object where R4 requires an array, and the same for `useContext`, `reasonCode`, `author` and
  hundreds more. JSON input was never affected — only XML, which has no schema to contradict the
  guess.

  Cardinality is now read from the R4 definitions, keyed by resource type, because the answer is not
  a property of the name alone: `Patient.name` repeats and `Organization.name` is a `0..1` string.
  That distinction used to be guessed at by checking whether the value looked like an object.

- **Any element named `resource` or `outcome` was treated as a wrapper around a nested resource.**
  Only two positions in all of R4 genuinely are. The other eighteen were destroyed:

  ```text
  <Procedure><outcome><text value="Successful"/></outcome></Procedure>
  before -> { outcome: { resourceType: 'text' } }      the value gone, a type invented
  after  -> { outcome: { text: 'Successful' } }

  <AuditEvent><outcome value="0"/></AuditEvent>
  before -> { }                                        the element gone entirely
  after  -> { outcome: '0' }
  ```

  Which positions really wrap a resource is now read from the definitions too. `Bundle.entry.resource`,
  `Parameters.parameter.resource` and `contained` still unwrap as before.

  Found by sweeping all 145 R4 resource types through the XML parser and into `validateBundle`,
  which was added in 2.3.0. It reported one failure, and the failure was real.

### Notes

- The XML entry point grows from ~77 KB to ~100 KB (~33 KB gzipped) for the cardinality table.
  Nothing else moves: parsing-only stays at ~13 KB, and the table ships only with the XML adapter.

## [2.3.0] — 2026-08-09

### Added

- **`fhir-normalize/validate` — check that a payload really is R4.** The library's central promise
  is that what comes out is a FHIR R4 Bundle, and nothing checked it at runtime. The suite verifies
  the library's *own* tables against vendored spec digests; a caller had no way to ask the same
  question of their data.

  ```ts
  import { validateBundle } from 'fhir-normalize/validate';

  for (const issue of validateBundle(bundle)) {
    console.log(issue.severity, issue.path, issue.message);
  }
  ```

  `validateResource(resource)` does one. Both return a flat array rather than throwing, so a payload
  with fifty problems reports fifty.

  | Severity | Reported |
  | --- | --- |
  | `error` | Wrong cardinality either way, an empty array (not valid FHIR JSON), a missing required element, or a choice carrying a type R4 forbids |
  | `warning` | An element R4 does not define, or a resource type it does not have |

  The split is deliberate. A cross-version payload can carry hundreds of elements R4 has no entry
  for, and a report that calls every one an error is a report nobody reads twice. Structural
  violations, which make anything reading the payload as R4 wrong about it, are errors.

  It descends one level into backbone elements, so a bad value inside `Observation.component` is
  reported at `Observation.component[1].valueNonsense`.

- **This makes the biggest documented limitation visible.** The migration table covers 14 of 794
  cross-version element differences and the README has always said the other ~780 pass through
  untouched with nothing reporting them. An R5 element on an R4 resource is, by definition, an
  element R4 does not define, so validation surfaces them without anyone guessing at 780 migrations.

### Notes

- The elements every resource inherits — `extension`, `contained`, `id` and the rest — are checked
  too, with cardinality read from the `Resource` and `DomainResource` definitions rather than
  written down. `extension` given a single object instead of an array is the commonest way a real
  payload is malformed, and a name-only skip list would have let it through.
- `validateBundle` validates the Bundle itself as well as what is in it, so a missing `type` or a
  non-array `entry` is reported rather than assumed away.
- Judged against `src/validate/r4-index.generated.ts`, generated from the same
  `spec/r4-elements.json` the conformance suite uses. A test regenerates it and fails if the
  committed copy differs, so the validator cannot drift from the specification.
- Its own entry point: ~80 KB bundled, ~15 KB gzipped, and nothing for anyone who does not import
  it. Parsing-only bundles stay at ~13 KB.
- Structural conformance against base R4 only. No terminology bindings, no profiles or
  implementation guides, no FHIRPath invariants, nothing deeper than one level inside a backbone.
  It is not a substitute for the official validator and the README says so.

## [2.2.2] — 2026-08-09

### Fixed

- **Deeply nested input could exhaust the stack during de-identification.** The scrub is recursive
  and threw `RangeError` at roughly 1,300 levels. `JSON.parse` accepts about 3,000, so a payload
  that deep arrives as an ordinary JSON string rather than a hand-built object, and this library
  exists to read data from other systems.

  The walk now stops at 100 levels, drops what is beyond, and reports it — the same thing the pass
  does with everything else it will not carry, so the outcome is deliberate rather than a
  `RangeError` from a library whose every other failure is a `ParseError`. Real FHIR nests nowhere
  near that: the recursive elements are `Questionnaire.item` and `Consent.provision`, and a
  demanding questionnaire is a few dozen levels.

  Parsing and the simplified view were unaffected. `simplifyResource` only descends into declared
  shape fields, so its depth is bounded by the tables rather than by the payload.

### Notes

- Throughput was measured for the first time and needed no changes: parse runs at ~1.9M
  resources/sec, the simplified view at ~167k, de-identification at ~149k, and per-resource cost
  stays flat from 5,000 to 40,000 resources, so scaling is linear.

## [2.2.1] — 2026-08-08

### Fixed

- **A `__proto__` key in a payload could set the prototype of a returned object.** `record[key] =
  value` adds a property for every key except that one, which is an accessor on `Object.prototype`
  and replaces the target's prototype instead. Objects built key by key, in the simplified view and
  the de-identification pass, came back answering to whatever the payload chose while `Object.keys`
  showed nothing of it.

  `Object.prototype` itself was never affected, and neither was the parse path, which builds with
  object spread and so creates an ordinary own property. Both now use a shared `assignKey` that
  keeps `__proto__` as an own property, so the value is still reported in `unmapped` rather than
  dropped and the two paths agree on what the payload contained.

- **The XML adapter let an error from `fast-xml-parser` escape unwrapped.** It refuses an element
  named `__proto__` after its own validator has passed the document, which reached the caller as a
  bare `Error` even though every other failure in that adapter is a `ParseError`.

## [2.2.0] — 2026-08-07

### Added

- **`toRows`, `toTables`, and `columnsOf` — the simplified view as flat records.** Analytics is one
  of the main reasons to normalize FHIR, and a flat table is what most downstream tools want. The
  simplified view already resolves choice elements onto one key and flattens every datatype to a
  fixed shape, so the last step was mechanical — and every consumer was writing it by hand, each
  slightly differently:

  ```ts
  import { simplifyBundle, toRows } from 'fhir-normalize/simplified';

  toRows(simplifyBundle(bundle));
  // [{ resourceType: 'Observation', id: 'obs-1', code: 'Body Weight', value: '74.5 kg', … }]
  ```

  A cell is `string | number | boolean | null`, so rows go straight to a CSV writer, a dataframe, or
  a database driver. Columns are stable **per resource type** — same keys, same order, `null` where
  a value is absent — so no writer can produce ragged output, and a Patient table does not carry
  Observation columns. `toTables` returns them grouped; `columnsOf` returns the header.

  The decisions worth knowing, all covered by tests:

  | Question | Answer |
  | --- | --- |
  | Repeating elements | The first entry plus a `_count` column, so the loss is visible. `{ lists: 'index' }` numbers them instead; `{ explode: 'name' }` makes each entry a row. |
  | Backbone elements | Flattened under their own prefix — `component_code` — following the same `lists` rule. `{ explode: 'component' }` gives the blood-pressure Observation a row per component. |
  | Column names | Joined with `_`, which cannot occur inside a FHIR element name and is legal unquoted in SQL. `component_0_value_unit` splits back into its parts. |
  | What is in a cell | `text` by default. `{ cells: 'typed' }` adds the value's own properties, so the LOINC code and the numeric magnitude survive as well as their rendering. |

  It emits no CSV text. Quoting, escaping, and encoding are solved problems, and rows hand off to
  whichever library already solved them.

- **A Rows tab in the [playground](https://fhir-normalize-playground.vercel.app)**, so the
  projection can be tried against a payload rather than read about. It renders a table per resource
  type with the three controls `toRows` exposes — `lists`, `cells`, and `explode` — and copies any
  table out as CSV, which is the library's own advice about who should own the quoting. The explode
  picker lists the repeating fields the parsed payload actually carries, so every option in it
  changes what you see. A `Blood pressure` sample was added alongside it: one Observation with two
  components, which is the case the flat projection has to answer for.

### Notes

- `toRows` is exported from `fhir-normalize/simplified` and **not** from the root entry point,
  which is the one place the root does not mirror the subpath. A bundle built against the root
  export is byte-for-byte the size it was before this existed.
- `explode` takes one field, not a list: exploding two repeating elements at once produces their
  cross product rather than a grain anyone asked for. A resource that lacks the field still
  produces its row, so the table's contents do not depend on which field the caller chose.
- The playground's row controls are built from `LIST_MODE` and `CELL_MODE` rather than from strings
  of their own, and a test asserts the two sets match — the same arrangement that keeps its parse
  modes in step with the registered formats.

## [2.1.0] — 2026-08-07

### Fixed

- **De-identification removed one form of an identifier while keeping another.** The redact list is
  matched on element names, and three identifiers appear under a name that was not on it:

  | Removed before | Survived before |
  | --- | --- |
  | `Location.address` | `Location.position` — latitude and longitude, which fix a building to about ten metres |
  | `Device.serialNumber` | `Device.udiCarrier` — whose `(21)` segment *is* the serial number |
  | free text, by default | `Attachment.data` / `Binary.data` — a scanned letter is prose, just base64 |

  All four are now removed, along with `Attachment.title`, which labels a document with its subject
  ("Referral for Sara Ahmed"). Pass `keep: ['position']` — or any element name — to override.

  A minor rather than a patch: this changes what de-identification does to **valid** input, not just
  malformed input, so anyone relying on coordinates surviving the pass will notice.

### Notes

- `title` is contextual, not a redact-list entry. It names an artefact on 33 R4 resources —
  `ValueSet.title`, `ActivityDefinition.title` — and only describes content on an Attachment. It is
  told apart by structure, the same way `Coding.display` is kept and `Reference.display` removed.
- `Consent.provision.data` shares a name with `Attachment.data` and is unaffected: it is a backbone
  element rather than a base64 string, and the rule keys on the value.

## [2.0.2] — 2026-08-06

### Fixed

- **A cross-version migration could write a value R4 does not allow.** The six converters that
  rewrite clinical data passed malformed input straight through, and whatever they returned went
  into the resource unchecked — so a non-string `Observation.comment` produced `note: 42` where R4
  requires `Annotation[]`, an `Observation.related` with no usable targets produced `hasMember: []`
  which FHIR JSON forbids, and an R5 `Encounter.class` carrying only `text` produced a `Coding` with
  a `text` element, which Coding does not have.

  A converter now returns nothing when it cannot produce a conformant value, and the element is
  dropped rather than written. These run on data from another release, so malformed input is the
  ordinary case rather than the exotic one.

- **The warning blamed the spec for a problem with the payload.** A dropped conversion reported
  `"comment" has no R4 equivalent`, when `comment` does have one and only this value was
  unconvertible. That case now reads `could not be expressed as R4 "note"`, distinct from the
  genuinely-absent elements like `Patient.animal`.

### Internal

- `version/converters.ts` goes from 62.5% to 100% branch coverage. It is the only code in the
  library that rewrites clinical data rather than reading it, so its fallbacks are checked against
  the R4 element each one writes to, rather than against what the code happened to do.

## [2.0.1] — 2026-08-06

No code change — `dist` is byte-identical to 2.0.0. Released so the npm page picks up the
playground link, which only reaches it through a publish.

### Documentation

- **The playground is live at
  [fhir-normalize-playground.vercel.app](https://fhir-normalize-playground.vercel.app)** and linked
  from the README and `package.json` `homepage`. It had never been publicly reachable before:
  Vercel Authentication was intercepting requests, and the short domain was unassigned.

### Internal

- The build now fails when the playground falls behind the library. It had drifted twice without
  anything noticing — NDJSON shipped in 1.12.0 and was never offered, and 2.0 moved the XML adapter
  out of the defaults while the playground kept advertising an `xml` toggle it could no longer
  honour. The new assertions compare the page against the registry: every registered format needs a
  parse mode and a label, no mode may exist that the library cannot serve, and every sample must
  detect *and* parse, both on auto and under its own named format. Verified by reintroducing both
  bugs.
- The playground had no tests; root `test` now runs every package rather than only the library.

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
