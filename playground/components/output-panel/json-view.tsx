import { tokenizeJson } from '@/utils';
import styles from './views.module.css';

/**
 * Syntax-highlighted JSON. Tokens are rendered as elements rather than injected
 * as HTML, so a payload containing markup can never escape into the page.
 */
export const JsonView = ({ value }: { value: unknown }) => (
  <pre className={styles.code}>
    {tokenizeJson(value).map((token) => (
      <span key={token.offset} className={styles[token.kind]}>
        {token.text}
      </span>
    ))}
  </pre>
);
