# Security

## Reporting

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/Syed-Ali-Abbas-Zaidi/fhir-normalize/security/advisories/new)
rather than opening a public issue.

Include what the problem allows, and the smallest input that shows it. If that input contains real
patient data, do not send it: describe the shape instead, or construct an equivalent with invented
values.

## Supported versions

The latest minor release is supported. Fixes land on `main` and ship as a new release rather than
being backported.

## What counts as a vulnerability here

This library parses untrusted input and removes identifiers from it, so the interesting failures are
in those two places.

**Parsing.** Input is genuinely untrusted. Anything that turns a malformed payload into a crash that
a caller cannot catch, unbounded memory growth, or prototype pollution is a vulnerability. A
malformed payload that produces a warning and a partial result is working as intended.

**De-identification.** The pass removes direct identifiers structurally, acting on element names and
datatypes. An identifier that survives it is worth reporting, particularly one that survives in one
form while being removed in another, since the rules match on element names and the same information
often appears under a different one.

The limits documented in the README are deliberate rather than defects:

- it is not certified HIPAA Safe Harbor or GDPR anonymisation, and cannot be, because whether an
  output meets an obligation depends on the data and the context
- surrogates are pseudonyms, not a one-way seal. They use a fast non-cryptographic hash so the pass
  can run synchronously in a browser. Anyone who knows the salt and can guess the input space can
  confirm a guess
- free text cannot be policed structurally, which is why it is removed by default
- ages over 89 are not aggregated, and dates are generalized rather than shifted, so intervals
  between events remain intact

If you think one of those limits is more dangerous in practice than the README implies, that is
worth raising as an issue rather than an advisory.

## Dependencies

The published package has two runtime dependencies. Everything else is build tooling and does not
reach consumers, so an advisory against the playground's toolchain does not affect anyone installing
the package. `pnpm audit --prod` reflects the whole workspace, not the published surface.
