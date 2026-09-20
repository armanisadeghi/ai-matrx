/**
 * THE PROXY IDENTITY GUARD.
 *
 * Contract: `common-docs/systems/platform/proxy-identity/FEATURE.md`.
 *
 * Three ways the 2026-09-20 `504 MIDDLEWARE_INVOCATION_TIMEOUT` class comes
 * back, and this refuses all three:
 *
 *  1. `getUser()` returns to the proxy path. It sends a request to the Auth
 *     server for EVERY JWT. Next 16 runs `proxy.ts` in the Node runtime and
 *     that "cannot be configured", so on Vercel each matched request — each
 *     `<Link>` prefetch included — is its own Lambda with a 15s task cap. An
 *     unbounded auth round trip in each one is how 19 requests in 48h answered
 *     504 instead of a page.
 *  2. The app stops reading `authUnavailable`. The resolve budget hands back a
 *     `null` user that looks exactly like a signed-out person, and every policy
 *     below it acts on a null user. Ignoring the flag turns a 2.5s network
 *     blink into a real logout and a bounce to /login mid-session.
 *  3. The matcher goes back to waking the pass for static bytes.
 *
 * Advisory by default (CI is a signal, never a gate); `--strict` exits non-zero.
 * `--self-test` proves it catches each case before you trust a green run.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const SELF_TEST = process.argv.includes("--self-test");

interface Finding {
  where: string;
  what: string;
  remedy: string;
}

/** Strip comments so a rule NAMED in prose is never mistaken for a call. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

export function auditProxyAuth(files: Record<string, string>): Finding[] {
  const findings: Finding[] = [];

  for (const [path, raw] of Object.entries(files)) {
    const body = code(raw);

    if (/\.auth\s*\.\s*getUser\s*\(/.test(body)) {
      findings.push({
        where: path,
        what: "calls auth.getUser() on the proxy path",
        remedy:
          "Use auth.getClaims() — local WebCrypto verification against the project JWKS (ES256), " +
          "as trusted as getUser() and with no network call in the steady state. " +
          "If this site genuinely needs created_at / identities / last_sign_in_at / factors / " +
          "*_confirmed_at, none of which are in the JWT, move that read OFF the proxy path instead.",
      });
    }

    if (/\.auth\s*\.\s*getSession\s*\(/.test(body)) {
      findings.push({
        where: path,
        what: "calls auth.getSession() on the proxy path",
        remedy:
          "getSession() believes whatever the cookie says and must never decide access. Use getClaims().",
      });
    }
  }

  const middleware = files["utils/supabase/middleware.ts"];
  if (middleware !== undefined && !/authUnavailable/.test(middleware)) {
    findings.push({
      where: "utils/supabase/middleware.ts",
      what: "never reads session.authUnavailable",
      remedy:
        "An auth authority we could not REACH is not a signed-out person. Pass the request " +
        "through when the flag is set — do not bounce to /login, do not capture a destination. " +
        "Without this a 2.5s network blink signs people out mid-session.",
    });
  }

  const proxy = files["proxy.ts"];
  if (proxy !== undefined) {
    const matcher = /"(\/\(\(\?![^"]*)"/.exec(proxy)?.[1] ?? "";
    if (!/\\\\?\.\(\?:.*svg/.test(matcher) && !matcher.includes("svg")) {
      findings.push({
        where: "proxy.ts",
        what: "the matcher no longer excludes static file extensions",
        remedy:
          "A bag of bytes has no session to refresh. GET /matrx/favicon-32x32.png was starting a " +
          "Node Lambda and /blob-sw.js timed out at 15s twice. Name the extensions — never match " +
          "'anything after a dot', which silently stops refreshing /c/<slug-with-a-dot>.",
      });
    }
  }

  return findings;
}

const WATCHED = [
  "proxy.ts",
  "utils/supabase/middleware.ts",
  "utils/supabase/authCookie.ts",
  "utils/supabase/resolveUser.ts",
];

function selfTest(): boolean {
  const cases: [string, Record<string, string>, number][] = [
    [
      "clean tree",
      {
        "proxy.ts": 'export const config = { matcher: ["/((?!api|.*\\\\.(?:js|svg|png)$).*)"] };',
        "utils/supabase/middleware.ts": "if (session.authUnavailable) return session.response;",
      },
      0,
    ],
    [
      "getUser() returns to the proxy path",
      {
        "proxy.ts": 'export const config = { matcher: ["/((?!api|.*\\\\.(?:js|svg|png)$).*)"] };',
        "utils/supabase/middleware.ts":
          "const { data } = await client.auth.getUser(); if (session.authUnavailable) return x;",
      },
      1,
    ],
    [
      "the app stops reading authUnavailable",
      {
        "proxy.ts": 'export const config = { matcher: ["/((?!api|.*\\\\.(?:js|svg|png)$).*)"] };',
        "utils/supabase/middleware.ts": "const user = session.user;",
      },
      1,
    ],
    [
      "the matcher stops excluding static bytes",
      {
        "proxy.ts": 'export const config = { matcher: ["/((?!api|_next/static).*)"] };',
        "utils/supabase/middleware.ts": "if (session.authUnavailable) return session.response;",
      },
      1,
    ],
    [
      "a comment NAMING getUser is not a call",
      {
        "proxy.ts": 'export const config = { matcher: ["/((?!api|.*\\\\.(?:js|svg|png)$).*)"] };',
        "utils/supabase/middleware.ts":
          "// never call client.auth.getUser() here\nif (session.authUnavailable) return session.response;",
      },
      0,
    ],
  ];

  let ok = true;
  for (const [name, files, expected] of cases) {
    const got = auditProxyAuth(files).length;
    const pass = got === expected;
    if (!pass) ok = false;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name} — expected ${expected}, got ${got}`);
  }
  return ok;
}

function main(): void {
  if (SELF_TEST) {
    console.log("check:proxy-auth-hot-path — self-test");
    const ok = selfTest();
    console.log(ok ? "\nself-test PASSED" : "\nself-test FAILED");
    process.exit(ok ? 0 : 1);
  }

  const files: Record<string, string> = {};
  for (const rel of WATCHED) {
    const abs = join(ROOT, rel);
    if (existsSync(abs)) files[rel] = readFileSync(abs, "utf8");
  }

  const findings = auditProxyAuth(files);
  if (findings.length === 0) {
    console.log(
      "check:proxy-auth-hot-path — OK. The proxy resolves identity locally, " +
        "bounded, and reads authUnavailable; the matcher leaves static bytes alone.",
    );
    return;
  }

  console.error(
    `\ncheck:proxy-auth-hot-path — ${findings.length} finding(s). ` +
      "Contract: common-docs/systems/platform/proxy-identity/FEATURE.md\n",
  );
  for (const f of findings) {
    console.error(`  ${f.where}\n    ${f.what}\n    -> ${f.remedy}\n`);
  }
  if (STRICT) process.exit(1);
}

main();
