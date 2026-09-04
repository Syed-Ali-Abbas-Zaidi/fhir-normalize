import type { Bundle, FhirResource } from 'fhir/r4';
import { describeNode, FhirNormalizeError, isRecord } from '../core';
import { SERIALIZE_ERROR, UNTYPED_GROUP } from './constants';

/**
 * One resource per line, which is the whole of the NDJSON format.
 *
 * `JSON.stringify` escapes every newline and carriage return it meets, so a
 * resource can never produce more than one line however much prose it carries
 * — that is what makes the format safe to split on `\n` and is asserted by a
 * test rather than assumed.
 *
 * @throws {FhirNormalizeError} A resource will not serialize, which for input
 *   that came from `parse()` cannot happen and for a hand-built object can.
 */
const lineFor = (resource: unknown, index: number): string => {
  const at = describeNode(typeOf(resource) ?? 'Resource', index);

  try {
    return `${JSON.stringify(resource)}\n`;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new FhirNormalizeError(SERIALIZE_ERROR.NOT_SERIALIZABLE(at, detail), { cause });
  }
};

/**
 * The declared `resourceType`, read as data rather than as the literal union
 * `FhirResource` promises.
 *
 * The type says it is one of 146 known strings; a Bundle from `parse()` can
 * hold a resource that never had one, because a root object with no
 * `resourceType` is kept and reported rather than dropped.
 */
const typeOf = (resource: unknown): string | undefined => {
  if (!isRecord(resource)) return undefined;

  const declared = resource.resourceType;
  return typeof declared === 'string' && declared !== '' ? declared : undefined;
};

/** The resources a Bundle carries, in order, skipping entries that hold none. */
const resourcesOf = (bundle: Bundle): FhirResource[] =>
  (bundle.entry ?? [])
    .map((entry) => entry.resource)
    .filter((resource): resource is FhirResource => resource !== undefined);

/**
 * A Bundle as newline-delimited JSON — the format Bulk Data `$export` returns
 * and this library reads.
 *
 * The Bundle wrapper is not written. NDJSON carries resources, not a Bundle
 * containing them, so `parse()` on the output produces an equivalent Bundle
 * rather than one nested inside another.
 *
 * Every line ends in a newline, including the last, so files concatenate
 * without joining two resources into one. An empty Bundle gives an empty
 * string, which is a valid empty export and not something `parse()` will read
 * back — there is nothing in it to detect.
 *
 * @example
 * ```ts
 * import { createDefaultNormalizer, toNdjson } from 'fhir-normalize';
 * import { hl7v2Parser } from 'fhir-normalize/hl7v2';
 *
 * const { bundle } = createDefaultNormalizer().register(hl7v2Parser).parse(adtMessage);
 * await writeFile('out.ndjson', toNdjson(bundle));
 * ```
 */
export const toNdjson = (bundle: Bundle): string =>
  resourcesOf(bundle)
    .map((resource, index) => lineFor(resource, index))
    .join('');

/**
 * The same resources, grouped into one document per resource type.
 *
 * What a Bulk Data export actually looks like on disk: `Patient.ndjson`,
 * `Observation.ndjson`, a file each. The keys are the resource types, so they
 * are the filenames.
 *
 * A resource with no `resourceType` is filed under `Unknown` rather than
 * dropped — `parse()` can produce one, and losing it silently here would undo
 * the reason it was kept.
 */
export const toNdjsonByType = (bundle: Bundle): Record<string, string> => {
  const groups: Record<string, string> = {};

  for (const [index, resource] of resourcesOf(bundle).entries()) {
    const type = typeOf(resource) ?? UNTYPED_GROUP;

    groups[type] = (groups[type] ?? '') + lineFor(resource, index);
  }

  return groups;
};
