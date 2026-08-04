'use client';

import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { THEME, THEME_OPTIONS, VISUALLY_HIDDEN } from '@/constants';
import { useTheme } from '@/hooks';
import type { Theme } from '@/types';
import styles from './theme-toggle.module.css';

/** Exhaustive over the theme union: a new theme will not compile until it has an icon. */
const themeIcon: Record<Theme, LucideIcon> = {
  [THEME.LIGHT]: Sun,
  [THEME.DARK]: Moon,
  [THEME.SYSTEM]: Monitor,
};

/**
 * Three states, not two: "system" is a real choice, and collapsing it into a
 * light/dark switch is what makes a page stop following the OS.
 */
export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();

  return (
    <fieldset className={styles.toggle}>
      <legend className={VISUALLY_HIDDEN}>Theme</legend>
      {THEME_OPTIONS.map(({ value, label }) => {
        const Icon = themeIcon[value];

        return (
          <button
            key={value}
            type="button"
            className={styles.option}
            aria-pressed={theme === value}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setTheme(value)}
          >
            <Icon size={14} strokeWidth={2} aria-hidden />
          </button>
        );
      })}
    </fieldset>
  );
};
