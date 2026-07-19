import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { MARKETING_GOOGLE_SCOPES } from "@/features/marketing/google/types";

export const GOOGLE_OAUTH_COOKIE = "marketing_google_oauth_state";

export interface GoogleOAuthState {
  state: string;
  codeVerifier: string;
  userId: string;
  ownerType: "user" | "organization";
  organizationId: string | null;
  returnPath: string;
  createdAt: number;
}

export interface StoredGoogleCredential {
  refreshToken: string;
  scopes: string[];
}

export interface EncryptedCredential {
  ciphertext: string;
  iv: string;
  tag: string;
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function encryptionKey(): Buffer {
  const material =
    process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!material) {
    throw new Error("Google OAuth credential encryption is not configured.");
  }
  return createHash("sha256")
    .update(`ai-matrx:marketing-google-oauth:v1:${material}`)
    .digest();
}

export function newOAuthState(): {
  state: string;
  verifier: string;
  challenge: string;
} {
  const state = base64Url(randomBytes(32));
  const verifier = base64Url(randomBytes(48));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { state, verifier, challenge };
}

export function signOAuthState(payload: GoogleOAuthState): string {
  const encoded = base64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", encryptionKey())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(value: string): GoogleOAuthState {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) throw new Error("Invalid Google OAuth session.");
  const expected = createHmac("sha256", encryptionKey())
    .update(encoded)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid Google OAuth session signature.");
  }
  const parsed = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as GoogleOAuthState;
  if (Date.now() - parsed.createdAt > 10 * 60 * 1000) {
    throw new Error("Google OAuth session expired. Please try again.");
  }
  return parsed;
}

export function encryptCredential(
  value: StoredGoogleCredential,
): EncryptedCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptCredential(
  value: EncryptedCredential,
): StoredGoogleCredential {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as StoredGoogleCredential;
}

export function googleAuthorizationUrl(input: {
  state: string;
  challenge: string;
  redirectUri: string;
}): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  if (!clientId) throw new Error("Google OAuth client ID is not configured.");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: MARKETING_GOOGLE_SCOPES.join(" "),
    state: input.state,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function safeReturnPath(value: unknown): string {
  return typeof value === "string" && value.startsWith("/marketing")
    ? value
    : "/marketing/connections";
}

export function popupResponse(
  origin: string,
  message: { ok: boolean; connectionId?: string; error?: string },
): Response {
  const payload = JSON.stringify({
    type: "marketing_google_oauth_complete",
    ...message,
  }).replaceAll("<", "\\u003c");
  const target = JSON.stringify(origin);
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Google connection</title></head><body><p>Google connection complete. You can close this window.</p><script>window.opener?.postMessage(${payload}, ${target});window.close();</script></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

export function callbackUri(origin: string): string {
  return `${origin}/api/marketing/google/oauth/callback`;
}
