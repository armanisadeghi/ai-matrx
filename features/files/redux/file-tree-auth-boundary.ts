import { supabase } from "@/utils/supabase/client";
import {
  isMissingSessionError,
  runWithSessionRetry,
  SessionUnavailableError,
  type AuthRetryableResult,
} from "@/lib/supabase/authRetry";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
/** Prevent a server-seeded Redux identity from issuing an RPC as anon. */
export async function hasMatchingFileTreeSession(
  requestedUserId: string,
): Promise<boolean> {
  // `getSession()` is kept ONLY for the access-token string; WHO the caller is
  // comes from the token's locally verified claims, not from the cookie.
  const [{ data: sessionData }, { data: claims }] = await Promise.all([
    supabase.auth.getSession(),
    getClaimsUser(supabase),
  ]);

  return Boolean(
    sessionData.session?.access_token && claims.user?.id === requestedUserId,
  );
}

/** Close the time-of-check/time-of-use gap around the authenticated RPC. */
export async function runFileTreeSessionOperation<T>(
  run: () => PromiseLike<AuthRetryableResult<T>>,
): Promise<AuthRetryableResult<T>> {
  const result = await runWithSessionRetry(run);
  if (result.error && isMissingSessionError(result.error, result.status)) {
    throw new SessionUnavailableError();
  }
  return result;
}
