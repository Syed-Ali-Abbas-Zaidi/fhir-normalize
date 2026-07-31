import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'fhir-normalize — paste any supported format, get one standard shape',
  description:
    'Live playground for fhir-normalize: paste FHIR JSON, FHIR XML, or an STU3/R5 resource and watch it become one canonical FHIR R4 Bundle.',
};

export const viewport: Viewport = {
  themeColor: '#0c7c84',
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;
