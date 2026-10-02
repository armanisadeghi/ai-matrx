/**
 * Session retry over the host's `db` (PACKAGE-INDEPENDENCE slice P6).
 *
 * `@ai-matrx/data`'s `createSessionRetry`, bound to the SAME client the
 * package queries through (the db seam): a call that failed only because no
 * session reached the server re-resolves that client's session and runs once
 * more. Read lazily, so importing this module touches no host.
 */

import { createSessionRetry } from "@ai-matrx/data/db";
import { supabase } from "./db";

export {
  isMissingSessionError,
  SessionUnavailableError,
  type AuthRetryableResult,
} from "@ai-matrx/data/db";

export const runWithSessionRetry = createSessionRetry({
  auth: { getSession: () => supabase.auth.getSession() },
});
