// ---------------------------------------------------------------------------
// AI Matrx OAuth 2.1 PKCE Utilities
// ---------------------------------------------------------------------------
// Implements the OAuth 2.1 Authorization Code Flow with PKCE against the
// AI Matrx Supabase project acting as an identity provider.
// ---------------------------------------------------------------------------

function requireEnv(name: "AIMATRX_SUPABASE_URL" | "AIMATRX_OAUTH_CLIENT_ID"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for AI Matrx OAuth but is not set`);
  }
  return value;
}

const AIMATRX_SUPABASE_URL = requireEnv("AIMATRX_SUPABASE_URL");
const AIMATRX_OAUTH_CLIENT_ID = requireEnv("AIMATRX_OAUTH_CLIENT_ID");
const AIMATRX_OAUTH_CLIENT_SECRET = process.env.AIMATRX_OAUTH_CLIENT_SECRET;

const AUTHORIZE_ENDPOINT = `${AIMATRX_SUPABASE_URL}/auth/v1/oauth/authorize`;
const TOKEN_ENDPOINT = `${AIMATRX_SUPABASE_URL}/auth/v1/oauth/token`;
const USERINFO_ENDPOINT = `${AIMATRX_SUPABASE_URL}/auth/v1/oauth/userinfo`;

// ---------------------------------------------------------------------------
// Base64 URL encoding
// ---------------------------------------------------------------------------

function base64URLEncode(buffer: Uint8Array): string {
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generateRandom(byteLength: number): string {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);
  return base64URLEncode(array);
}

async function sha256(input: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(hash);
}

// ---------------------------------------------------------------------------
// PKCE parameter generation
// ---------------------------------------------------------------------------

interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

export async function generatePKCEParams(): Promise<PKCEParams> {
  const codeVerifier = generateRandom(32);
  const challengeHash = await sha256(codeVerifier);
  const codeChallenge = base64URLEncode(challengeHash);
  const state = generateRandom(16);
  return { codeVerifier, codeChallenge, state };
}

// ---------------------------------------------------------------------------
// Authorization URL builder
// ---------------------------------------------------------------------------

export function buildAuthorizeURL(
  redirectUri: string,
  codeChallenge: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: AIMATRX_OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    scope: "email profile",
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  id_token?: string;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: AIMATRX_OAUTH_CLIENT_ID,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (AIMATRX_OAUTH_CLIENT_SECRET) {
    const credentials = btoa(
      `${AIMATRX_OAUTH_CLIENT_ID}:${AIMATRX_OAUTH_CLIENT_SECRET}`,
    );
    headers["Authorization"] = `Basic ${credentials}`;
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<TokenResponse>;
}

// ---------------------------------------------------------------------------
// UserInfo
// ---------------------------------------------------------------------------

export interface AIMatrxUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  phone_number?: string;
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<AIMatrxUserInfo> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`UserInfo fetch failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<AIMatrxUserInfo>;
}
