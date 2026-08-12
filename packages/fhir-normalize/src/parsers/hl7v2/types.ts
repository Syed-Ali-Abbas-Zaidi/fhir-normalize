/**
 * The five characters a message declares in `MSH-1` and `MSH-2`.
 *
 * Read from the message rather than assumed. `|^~\&` is overwhelmingly common
 * and is not guaranteed: the point of declaring them is that a sender may
 * choose others, and a parser that hardcodes the usual set silently mis-splits
 * everything from one that does.
 */
export interface Delimiters {
  readonly field: string;
  readonly component: string;
  readonly repetition: string;
  readonly escape: string;
  readonly subcomponent: string;
}

/** One component, split into its subcomponents. Always at least one entry. */
type Component = readonly string[];

/** One repetition of a field, split into components. */
export type Repetition = readonly Component[];

/** A field: its repetitions, in order. An absent field is an empty array. */
export type Field = readonly Repetition[];

/**
 * One segment.
 *
 * `fields` is indexed from **one**, matching how the standard and every
 * specification document numbers them — `PID-3` is `fields[3]`. Index 0 holds
 * the segment id, so nothing has to remember an offset. `MSH` is normalised on
 * the way in so that `MSH-1` really is the field separator and `MSH-3` really
 * is the sending application, which is otherwise the first thing every v2
 * parser gets wrong.
 */
export interface Segment {
  readonly id: string;
  readonly fields: readonly Field[];
}

export interface Message {
  readonly delimiters: Delimiters;
  readonly segments: readonly Segment[];
}
