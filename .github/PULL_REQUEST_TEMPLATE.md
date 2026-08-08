<!--
Delete anything that does not apply. A one-line PR with a one-line description
is fine; the prompts below are for changes where they earn their place.
-->

## What this changes

<!-- What behaviour is different afterwards, and why that matters. -->

## How it was verified

<!--
Beyond "tests pass". If you fixed something that shipped, say whether you
reintroduced it and watched the new test fail.
-->

## Checklist

- [ ] `pnpm verify` passes
- [ ] `CHANGELOG.md` updated, if this should appear in a release
- [ ] Version bumped in `packages/fhir-normalize/package.json`, if this should be released
- [ ] Generated files regenerated rather than hand-edited (`fields.generated.ts`, `spec/*.json`)
- [ ] README bundle-size figures re-measured, if the change could move them

## Anything reviewers should look at closely

<!--
The part you are least sure about, or a decision that could reasonably have
gone the other way.
-->
