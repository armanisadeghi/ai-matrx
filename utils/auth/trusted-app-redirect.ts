/** Exact redirect validation for first-party SPAs that receive auth tokens. */

const STATIC_TRUSTED_ORIGINS = [
  "https://admin.aimatrx.com",
  "https://workflows.aimatrx.com",
  "https://studio.aimatrx.com",
];

const DEV_TRUSTED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
];

function trustedOrigins(): Set<string> {
  const configured = (process.env.MATRX_TRUSTED_SUBDOMAIN_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([
    ...STATIC_TRUSTED_ORIGINS,
    ...configured,
    ...(process.env.NODE_ENV === "production" ? [] : DEV_TRUSTED_ORIGINS),
  ]);
}

/**
 * Returns a normalized first-party SPA callback or null. An origin allowlist
 * alone is insufficient: tokens may only land on the dedicated callback path.
 */
export function trustedAppRedirect(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (!trustedOrigins().has(url.origin)) return null;
    if (url.pathname !== "/oauth/callback") return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
