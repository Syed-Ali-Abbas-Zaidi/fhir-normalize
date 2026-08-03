/**
 * Stable surrogate values.
 *
 * The same input and salt always produce the same surrogate, which is what
 * keeps a Bundle's internal references resolving after identifiers are
 * replaced. Different salts produce different surrogates, so two datasets
 * de-identified with different salts cannot be joined on them.
 *
 * This is FNV-1a, **not** a cryptographic hash, because the pass has to run
 * synchronously in a browser as well as in Node — `node:crypto` is unavailable
 * there and Web Crypto is async. The consequence is real and worth stating: a
 * surrogate is a consistent pseudonym, not a one-way seal. An attacker who
 * knows the salt and can guess the input space (medical record numbers in a
 * known format, say) can confirm a guess by re-deriving it. Use a long random
 * salt you do not publish, and treat the output as pseudonymised rather than
 * anonymised.
 */

const OFFSET_BASIS = 0x811c9dc5;
const PRIME = 0x01000193;

const fnv1a = (input: string): number => {
  let hash = OFFSET_BASIS;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, PRIME);
  }

  return hash >>> 0;
};

/** A short, stable, URL-safe token derived from the value and the salt. */
export const surrogate = (value: string, salt: string): string => {
  // Two passes over different framings so short inputs still spread out.
  const first = fnv1a(`${salt}:${value}`).toString(36);
  const second = fnv1a(`${value}:${salt}:${first}`).toString(36);

  return `${first}${second}`.padEnd(12, '0').slice(0, 12);
};

/**
 * Replace the identifying part of a reference while keeping it navigable.
 *
 * `Patient/pat-1` becomes `Patient/<surrogate>`: the type still says what it
 * points at, and every other reference to that patient resolves to the same
 * surrogate, so the graph survives.
 */
export const surrogateReference = (reference: string, salt: string): string => {
  const separator = reference.lastIndexOf('/');

  if (separator <= 0) return surrogate(reference, salt);

  const type = reference.slice(0, separator);
  const id = reference.slice(separator + 1);

  return `${type}/${surrogate(id, salt)}`;
};
