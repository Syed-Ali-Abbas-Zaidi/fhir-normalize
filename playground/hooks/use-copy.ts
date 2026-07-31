'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { COPY_RESET_MS } from '@/constants';

interface CopyState {
  copied: boolean;
  copy: (text: string) => void;
}

/**
 * Copy-to-clipboard with a self-clearing "copied" flag.
 *
 * The effect exists only to clear the pending timer on unmount — an external
 * resource React does not own. It deliberately has its own empty dependency
 * list so it never tears down a timer that is still counting.
 */
export const useCopy = (): CopyState => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), COPY_RESET_MS);
  }, []);

  return { copied, copy };
};
