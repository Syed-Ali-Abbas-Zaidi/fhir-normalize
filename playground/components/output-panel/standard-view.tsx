import type { Bundle } from 'fhir-normalize';
import { JsonView } from './json-view';

/** The canonical R4 Bundle, exactly as the library returns it. */
export const StandardView = ({ bundle }: { bundle: Bundle }) => <JsonView value={bundle} />;
