# Contributing

Thanks for taking an interest. This is a small library with a few strong opinions, and most of them
exist because getting them wrong was expensive at some point. This page is mainly about those.

## Getting set up

```bash
pnpm install
pnpm --filter fhir-normalize build   # the playground and its tests resolve dist/
pnpm verify                          # build, lint, typecheck, test
```

`pnpm verify` is what CI runs. If it passes locally it will almost certainly pass on the PR.

Node 22.13 or newer is needed for the toolchain, because pnpm 11 refuses to start below it. The
*published package* supports Node 18 and up, which is a separate claim tested by the `smoke` job
against a real tarball rather than the workspace.

## The one thing to understand before changing anything

**Claims about FHIR are checked against the specification, not asserted.**

The shape tables, the cross-version migration table, and the de-identification rules were all
originally written from knowledge of FHIR and tested against examples written from the same
knowledge. Every one of them turned out to contain errors that no test could see, because the tests
shared the assumptions of the code.

So the repository vendors digests of the published definitions and checks against them:

| File | What it holds | Regenerate with |
| --- | --- | --- |
| `packages/fhir-normalize/spec/r4-elements.json` | Every R4 element, its types, cardinality, and whether it is required | `pnpm --filter fhir-normalize spec:fetch` |
| `packages/fhir-normalize/spec/stu3-keys.json` | The payload keys an STU3 resource can carry | same script |
| `packages/fhir-normalize/spec/r5-keys.json` | The same for R5 | same script |

Practically, this means:

- Add a field to a shape table and the conformance suite fails unless R4 actually has that element,
  with that cardinality, of a type consistent with the kind you declared.
- Add a row to `VERSION_MIGRATION` and it fails unless the source element exists in the release you
  claim it comes from, the target exists in R4, and the marker cannot appear in a genuine R4 payload.
- Add a format adapter and the playground tests fail until the playground offers it.

If one of those tests fails, the usual answer is that the code is wrong rather than the test.

## Generated files

Two things are generated. Editing them by hand will be reverted by a test.

- `src/simplified/fields.generated.ts` — the per-resource field types. Run
  `node scripts/generate-field-types.mjs` from the package directory after changing a shape table.
  A test regenerates it and fails if the committed copy differs.
- `spec/*.json` — see the table above. These change only when the FHIR definitions do, which for a
  frozen release is never.

## Making a change

Work on a branch, open a pull request, and let CI run. A few conventions:

- **Include the version bump in the pull request** if the change should be released. Releases are
  tag driven: pushing `vX.Y.Z` runs the full gate again and publishes only if the tag matches the
  version in `package.json`.
- **Semantic versioning is taken literally.** A change to what the library does with *valid* input
  is a minor at least, even when it is a bug fix. Removing something from the public surface, or
  narrowing a type consumers might depend on, is a major.
- **Add an entry to `CHANGELOG.md` if the change reaches a release.** Anything a consumer of the
  package could notice belongs there, which is most changes. Repository plumbing that never ships,
  such as a CI tweak, does not. Say what changed and why it mattered, not just what was touched.
- **Bundle size is a public claim.** The README lists measured figures per entry point. If a change
  moves them, measure again and update the table. The heavy parts live behind subpaths precisely so
  that a consumer who does not import them does not pay for them.

## Dependency updates

Dependabot opens grouped pull requests weekly. Minor and patch updates to development and indirect
dependencies approve and merge themselves once CI is green. Anything else waits for a person: a
major update, or any update to a dependency that reaches the published package, since CI does not
check the README's bundle-size figures and a runtime dependency changes what consumers install.

The workflow comments on the pull requests it declines to merge, saying which rule applied. It also
refuses to merge anything at all unless `main` requires the CI checks: auto-merge is a queue that
waits for *required* checks, so without them it would merge before CI had reported.

## Tests

- Runtime behaviour: `*.test.ts`
- Types: `*.test-d.ts`, which run as part of `pnpm test`. The generated field types are only ever
  wrong at compile time, so nothing else would catch a mistake in them.
- Prefer a test that would have caught the bug over a test that describes the fix. If you are fixing
  something that shipped, reintroduce it locally first and confirm the new test fails.

## Style

Formatting and linting are handled by Biome; `pnpm lint:fix` applies both. Beyond that:

- Comments explain *why*, not what. The code says what it does.
- Where a decision is not obvious, record the reasoning next to it. Most of the comments in this
  repository exist because someone would otherwise reasonably assume the opposite.
- Tables over branching. Adding support for another difference between FHIR releases should be a new
  row, never a new code path.

## Reporting something

Bugs and feature requests both go to
[Issues](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/issues). For a bug, the input that
caused it is worth more than a description of it.

**Never put real patient data in an issue, including data this library has de-identified.** The
de-identification pass is structural and explicitly not certified anonymisation, so it can leave
residual identifiers and does nothing about quasi-identifiers. Describe the shape of the input
instead, or reproduce it with invented values. A synthetic payload that triggers the bug is worth
more than a real one anyway, because it can go straight into a test.

## Security

Please do not open a public issue for a security problem. Report it privately through
[GitHub security advisories](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/security/advisories/new).

Note that de-identification in this library is a structural pass and is explicitly not certified
anonymisation. A gap in its coverage is a bug worth reporting; the documented limits are not.
