/**
 * Where a resource with no `resourceType` is filed by `toNdjsonByType`.
 *
 * `parse()` can produce one: a payload whose root object has no
 * `resourceType` is kept as-is and reported, rather than dropped. It still has
 * to go somewhere here, and a bucket the caller can see beats losing it.
 */
export const UNTYPED_GROUP = 'Unknown';

export const SERIALIZE_ERROR = {
  NOT_SERIALIZABLE: (at: string, detail: string): string =>
    `${at} cannot be written as JSON — ${detail}. NDJSON is one JSON document per line, so a ` +
    'resource that will not serialize has no line to occupy.',
} as const;
