'use client';

import { useSyncExternalStore } from 'react';
import type { ThemeState } from '@/types';
import { themeStore } from '@/utils';

/**
 * Subscribes to the theme store.
 *
 * `useSyncExternalStore` — rather than state seeded from an effect — is what
 * keeps the server render (always the default preference) and the client's
 * stored choice from tripping a hydration mismatch: React swaps snapshots
 * itself once hydration is done.
 *
 * Subscribing also keeps the store's OS-preference listener alive, which is how
 * "system" follows the machine while the tab is open.
 */
export const useTheme = (): ThemeState => {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getTheme,
    themeStore.getServerTheme,
  );

  return { theme, setTheme: themeStore.setTheme };
};
