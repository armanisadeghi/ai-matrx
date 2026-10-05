import "server-only";

/**
 * utils/auth/signer-email-lookup.ts
 *
 * The e-signature twin of `invited-email-lookup.ts` (DD-091): someone who just signed a document
 * from an emailed link is invited to create a free account, and the sign-up field should already
 * hold the address they signed with. The address never travels in a URL — the link carries a
 * one-time HINT (`?signer_hint=`, minted by aidream when they signed) and it is resolved here
 * through the one narrow anonymous door `public.esign_peek_signer_email(p_hint)`: only for a
 * signed outside signer, only for 7 days, else `null` — the field simply renders empty.
 *
 * Server-only, and never fatal: sign-up works with an empty field.
 */

import { createClient } from "@/utils/supabase/server";

export const SIGNER_HINT_PARAM = "signer_hint";
const HINT_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

/** The hint from a sign-up page's search params, shape-checked; null when absent or malformed. */
export function readSignerHint(params: Record<string, string | string[] | undefined | null>): string | null {
  const raw = params[SIGNER_HINT_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && HINT_SHAPE.test(value) ? value : null;
}

export async function lookupSignerEmail(hint: string | null): Promise<string | null> {
  if (!hint) return null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("esign_peek_signer_email", { p_hint: hint });
    if (error) {
      console.warn("esign_peek_signer_email failed; sign-up will render an empty email field:", error.message);
      return null;
    }
    return typeof data === "string" && data.length > 0 ? data : null;
  } catch (e) {
    console.warn("esign_peek_signer_email threw; sign-up will render an empty email field:", e instanceof Error ? e.message : e);
    return null;
  }
}
