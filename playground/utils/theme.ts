import { DEFAULT_THEME, THEME, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '@/constants';
import type { ResolvedTheme, Theme } from '@/types';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const themeValues: readonly string[] = Object.values(THEME);

const isTheme = (value: string | null): value is Theme =>
  value !== null && themeValues.includes(value);

/** Which concrete surface a preference lands on. */
const resolveTheme = (theme: Theme, prefersDark: boolean): ResolvedTheme => {
  if (theme !== THEME.SYSTEM) return theme;
  return prefersDark ? THEME.DARK : THEME.LIGHT;
};

let query: MediaQueryList | null = null;

const darkQuery = (): MediaQueryList | null => {
  if (query === null && typeof window !== 'undefined') {
    query = window.matchMedia(DARK_QUERY);
  }
  return query;
};

/**
 * The preference, cached so `getSnapshot` stays cheap and — more importantly —
 * referentially stable, which `useSyncExternalStore` requires.
 */
let preference: Theme | null = null;

const readStored = (): Theme => {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(value) ? value : DEFAULT_THEME;
  } catch {
    /* Storage blocked (private mode, embedded frame) — fall back to the OS. */
    return DEFAULT_THEME;
  }
};

const getTheme = (): Theme => {
  preference ??= readStored();
  return preference;
};

const getPrefersDark = (): boolean => darkQuery()?.matches ?? false;

/**
 * The store is the sole owner of the `data-theme` attribute at runtime, which
 * is why nothing here needs an effect: the attribute can only go stale when the
 * preference changes or the OS flips, and both paths land in here.
 *
 * (The very first write happens earlier still, in the bootstrap script — see
 * `THEME_BOOTSTRAP_SCRIPT`.)
 */
const syncDocument = (): void => {
  document.documentElement.setAttribute(
    THEME_ATTRIBUTE,
    resolveTheme(getTheme(), getPrefersDark()),
  );
};

const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

const onSystemChange = (): void => {
  syncDocument();
  notify();
};

const subscribe = (listener: () => void): (() => void) => {
  if (listeners.size === 0) darkQuery()?.addEventListener('change', onSystemChange);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) darkQuery()?.removeEventListener('change', onSystemChange);
  };
};

const setTheme = (theme: Theme): void => {
  preference = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Storage blocked — the choice still applies, it just will not survive a reload. */
  }
  syncDocument();
  notify();
};

/**
 * A module-level store rather than a context: the theme has exactly one value
 * per document, no component owns it, and every reader wants the same answer.
 * Consumed through `useTheme`.
 */
export const themeStore = {
  subscribe,
  setTheme,
  getTheme,
  /** Server render has no storage and no media query: assume the default. */
  getServerTheme: (): Theme => DEFAULT_THEME,
};
