/**
 * utils/auth/signer-hint-link.ts — puts an e-signature signer's one-time hint on a sign-up link.
 *
 * Client-safe (the lookup in `signer-email-lookup.ts` is server-only). The hint is opaque; the
 * address it stands for is resolved on the sign-up page and never appears in the URL.
 */

const PARAM = "signer_hint";
const HINT_SHAPE = /^[A-Za-z0-9_-]{16,64}$/;

export function withSignerHint(authUrl: string, hint: string | null | undefined): string {
  if (typeof hint !== "string" || !HINT_SHAPE.test(hint)) return authUrl;
  const [base, hash] = authUrl.split("#");
  const rebuilt = `${base}${base.includes("?") ? "&" : "?"}${PARAM}=${encodeURIComponent(hint)}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}
