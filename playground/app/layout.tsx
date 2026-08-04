import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { THEME_BOOTSTRAP_SCRIPT } from '@/constants';
import './globals.css';

export const metadata: Metadata = {
  title: 'fhir-normalize — paste any supported format, get one standard shape',
  description:
    'Live playground for fhir-normalize: paste FHIR JSON, FHIR XML, or an STU3/R5 resource and watch it become one canonical FHIR R4 Bundle.',
};

/* The browser chrome cannot read a custom property, so these mirror `--bg`. */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f8f8' },
    { media: '(prefers-color-scheme: dark)', color: '#05090d' },
  ],
};

/*
 * `suppressHydrationWarning` covers exactly one thing: the `data-theme`
 * attribute the bootstrap script writes onto <html> before React ever sees it.
 */
const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en" suppressHydrationWarning>
    <head>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a build-time constant, no user input */}
      <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} />
    </head>
    <body>{children}</body>
  </html>
);

export default RootLayout;
