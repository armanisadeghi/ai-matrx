/**
 * @jest-environment node
 *
 * PINNED SIGNING KEYS VERIFY ONLY FOR THE AUTHORITY THAT OWNS THEM.
 *
 * The live project's public key was pinned into every claims check, so on a
 * build wired to the nightly clone (a separate project, its own key) a session
 * minted by LIVE still verified as "signed in" — the server rendered the
 * signed-in workspace over a database that refused every read (2026-10-02).
 *
 * Proven with the real auth-js client: a token signed by key A, verified by a
 * client whose authority serves key B.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { AuthClient } from "@supabase/auth-js";
import type { JWK } from "@supabase/supabase-js";

const webcrypto = globalThis.crypto;
import {
  PROJECT_SIGNING_KEYS,
  pinnedSigningKeysFor,
} from "@/utils/supabase/projectSigningKeys";
import { isUnverifiableTokenError } from "@/utils/supabase/unverifiableSession";

const LIVE = "https://db.matrxserver.com";
const CLONE = "https://ajrnyxwasqbmxdmzvfdy.supabase.co";

function b64url(bytes: Uint8Array | string): string {
  return Buffer.from(bytes).toString("base64url");
}

async function signedToken(kid: string, key: CryptoKey): Promise<string> {
  const header = b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: "87a6e699-3622-4869-8843-d0867456c0dd", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }),
  );
  const sig = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

async function keyPair(kid: string) {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const pinned: JWK = { ...jwk, kty: "EC", kid, alg: "ES256", use: "sig", key_ops: ["verify"] };
  return { privateKey: pair.privateKey, jwk: pinned };
}

describe("pinnedSigningKeysFor", () => {
  it("hands the live keys only to the live authority", () => {
    expect(pinnedSigningKeysFor(LIVE)).toBe(PROJECT_SIGNING_KEYS);
    expect(pinnedSigningKeysFor("https://brsgrqvjdzwihsvnfqkf.supabase.co")).toBe(PROJECT_SIGNING_KEYS);
    expect(pinnedSigningKeysFor(CLONE)).toEqual([]);
    expect(pinnedSigningKeysFor(undefined)).toEqual([]);
    expect(pinnedSigningKeysFor("not a url")).toEqual([]);
  });

  it("a token signed by another authority's pinned key does not verify on the clone", async () => {
    const live = await keyPair("live-kid");
    const clone = await keyPair("clone-kid");
    const token = await signedToken("live-kid", live.privateKey);

    // The clone's auth server: its JWKS holds only its own key, and /user
    // refuses a token it cannot verify exactly as GoTrue does.
    const fetchStub = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/.well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [clone.jwk] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(
        JSON.stringify({ code: 403, error_code: "bad_jwt", msg: "invalid JWT: unable to parse or verify signature" }),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;
    const auth = new AuthClient({ url: `${CLONE}/auth/v1`, fetch: fetchStub, persistSession: false, autoRefreshToken: false });

    // What every claims door did before: the live key pinned unconditionally.
    const unscoped = await auth.getClaims(token, { jwks: { keys: [live.jwk] } });
    expect(unscoped.error).toBeNull(); // ← the door: a foreign token "verified"

    // What every claims door does now: only this authority's pinned keys.
    const scoped = await auth.getClaims(token, { jwks: { keys: pinnedSigningKeysFor(CLONE) } });
    expect(scoped.data).toBeNull();
    expect(isUnverifiableTokenError(scoped.error)).toBe(true);
  });
});

describe("no claims door passes the pinned keys unscoped", () => {
  it("PROJECT_SIGNING_KEYS is read only through pinnedSigningKeysFor", () => {
    const root = join(__dirname, "..", "..", "..");
    const hits = execFileSync("git", ["grep", "-l", "PROJECT_SIGNING_KEYS", "--", "*.ts", "*.tsx"], {
      cwd: root,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    const allowed = new Set([
      "utils/supabase/projectSigningKeys.ts",
      "utils/supabase/__tests__/projectSigningKeys.authority.test.ts",
      // compares the pinned list with the live JWKS; never verifies a token
      "scripts/check-session-verdict.ts",
    ]);
    const offenders = hits.filter((file) => !allowed.has(file));
    // Each offender must call pinnedSigningKeysFor(process.env.NEXT_PUBLIC_SUPABASE_URL).
    expect(offenders).toEqual([]);
  });
});
