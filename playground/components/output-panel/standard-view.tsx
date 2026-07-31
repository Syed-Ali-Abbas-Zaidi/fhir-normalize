import type { Bundle } from 'fhir-normalize';
import { tokenizeJson } from '@/utils';
import styles from './views.module.css';

/**
 * Tokens are rendered as elements rather than injected as HTML, so a payload
 * containing markup can never escape into the page.
 */
export const StandardView = ({ bundle }: { bundle: Bundle }) => (
  <pre className={styles.code}>
    {tokenizeJson(bundle).map((token) => (
      <span key={token.offset} className={styles[token.kind]}>
        {token.text}
      </span>
    ))}
  </pre>
);
