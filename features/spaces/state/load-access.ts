// features/spaces/state/load-access.ts — what a failed tree read means for the person.
//
// The store's list read goes through `readAllRows`, which flattens PostgREST's error into a sentence
// ("readAllRows(content.space_list): query failed — permission denied for function space_list") and
// drops `.code`. That sentence is database text, never something a person reads. A refusal is one of:
// signed out (no session: anon is refused by design), a boot race (the session had not attached yet —
// retried once by the provider), or no access. Anything else is a fault.

import { classifyDataError } from "@/features/access-gate/classifyDataError";
import { createClient } from "@/utils/supabase/client";

export type LoadAccess = "signed-out" | "no-access";

const REFUSAL = /permission denied|42501|insufficient[_ ]privilege|JWT expired|not authenticated|401|403/i;

/** True when a thrown read error is a refusal (by code, or by the sentence readAllRows leaves). */
export function isRefusal(err: unknown): boolean {
  if (classifyDataError(err) === "denied") return true;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return REFUSAL.test(message);
}

/** Whether this tab has a signed-in session right now. */
export async function hasSignedInSession(): Promise<boolean> {
  try {
    const { data } = await createClient().auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

/** Calls `listener` when the person signs in (or the session attaches) in this tab. */
export function onSignedIn(listener: () => void): () => void {
  const { data } = createClient().auth.onAuthStateChange((event, session) => {
    if (session && event === "SIGNED_IN") listener();
  });
  return () => data.subscription.unsubscribe();
}
