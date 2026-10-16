/**
 * The bundle's genie_space_id defaults to this placeholder: the Apps runtime rejects an env entry whose
 * value is an empty string, so a first deploy (before the Genie space exists) passes a non-empty word.
 */
export const GENIE_PLACEHOLDER = 'none';

/** The real Genie space id from the environment, or null when it is unset, empty or the placeholder. */
export function genieSpaceIdFrom(env: Record<string, string | undefined>): string | null {
  const id = (env.DATABRICKS_GENIE_SPACE_ID ?? '').trim();
  if (id === '' || id.toLowerCase() === GENIE_PLACEHOLDER) return null;
  return id;
}
