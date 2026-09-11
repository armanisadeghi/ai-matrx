import "server-only";

/**
 * utils/auth/invited-email-lookup.ts
 *
 * Turns an invitation token into the address that invitation was sent to, for
 * the ONE purpose of prefilling the sign-up / login field for someone who does
 * not have an account yet (DD-091).
 *
 * The address never travels in a URL (see `invitation-links.ts`), so the token
 * arrives instead and is resolved here through the single narrow door
 * `public.inv_peek_invited_email(p_token)` — anonymous-callable, returns ONLY
 * the email, and only for a pending, unaccepted, unexpired invitation.
 * Anything else is `null`, which is indistinguishable from a token that never
 * existed: the field simply renders empty.
 *
 * Server-only on purpose. It runs on the auth pages (server components) so the
 * token never has to be handed to client JavaScript, and a failure here can
 * never break sign-up — the field is prefilled or it is not.
 */

import { createClient } from "@/utils/supabase/server";

export async function lookupInvitedEmail(
  token: string | null | undefined,
): Promise<string | null> {
  if (!token) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("inv_peek_invited_email", {
      p_token: token,
    });
    if (error) {
      // Never fatal: sign-up must work with an empty field. Logged, not hidden.
      console.warn(
        "inv_peek_invited_email failed; sign-up will render an empty email field:",
        error.message,
      );
      return null;
    }
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch (e) {
    console.warn(
      "inv_peek_invited_email threw; sign-up will render an empty email field:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}
