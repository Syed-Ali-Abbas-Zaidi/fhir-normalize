import { JSON_TOKEN } from '@/constants';
import type { JsonToken, JsonTokenKind } from '@/types';

/** Strings (with an optional trailing key colon), literals, and numbers. */
const tokenPattern =
  /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;

/**
 * Split formatted JSON into typed tokens for rendering.
 *
 * Returning data rather than an HTML string is deliberate: the panel renders
 * real elements, so no amount of markup in the pasted payload can escape into
 * the page.
 */
export const tokenizeJson = (value: unknown): JsonToken[] => {
  const json = JSON.stringify(value, null, 2) ?? '';
  const tokens: JsonToken[] = [];
  let cursor = 0;

  for (const match of json.matchAll(tokenPattern)) {
    const [text] = match;
    const { index } = match;
    if (text === undefined || index === undefined) continue;

    if (index > cursor) {
      tokens.push({ offset: cursor, text: json.slice(cursor, index), kind: JSON_TOKEN.PLAIN });
    }
    tokens.push({ offset: index, text, kind: classify(text) });
    cursor = index + text.length;
  }

  if (cursor < json.length) {
    tokens.push({ offset: cursor, text: json.slice(cursor), kind: JSON_TOKEN.PLAIN });
  }

  return tokens;
};

const classify = (text: string): JsonTokenKind => {
  if (text.startsWith('"')) {
    return text.trimEnd().endsWith(':') ? JSON_TOKEN.KEY : JSON_TOKEN.STRING;
  }
  if (text === 'true' || text === 'false' || text === 'null') return JSON_TOKEN.LITERAL;
  return JSON_TOKEN.NUMBER;
};
