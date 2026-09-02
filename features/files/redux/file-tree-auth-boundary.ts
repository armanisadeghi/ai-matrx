import { supabase } from "@/utils/supabase/client";
import {
  isMissingSessionError,
  runWithSessionRetry,
  SessionUnavailableError,
  type AuthRetryableResult,
} from "@/lib/supabase/authRetry";

/** Prevent a server-seeded Redux identity from issuing an RPC as anon. */
export async function hasMatchingFileTreeSession(
  requestedUserId: string,
): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return Boolean(
    session?.access_token && session.user.id === requestedUserId,
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
