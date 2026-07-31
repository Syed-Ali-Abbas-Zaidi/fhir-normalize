import type { WarningLog } from './types';

/**
 * Shared warning accumulator. Parsers collect recoverable gaps here instead of
 * throwing, so one malformed field never costs the caller the whole payload.
 */
export const createWarningLog = (): WarningLog => {
  const messages: string[] = [];

  return {
    add: (message) => {
      messages.push(message);
    },
    list: () => [...messages],
  };
};
