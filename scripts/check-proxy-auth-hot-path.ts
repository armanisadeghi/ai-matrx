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
import { exitAfterDrain } from "./lib/exit-after-drain";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

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
    if (!matcher) {
      findings.push({
        where: "proxy.ts",
        what: "no `config.matcher` could be read",
        remedy:
          "Without a matcher this pass runs on EVERY request, static bytes included. " +
          "If the shape changed, teach this guard the new one rather than deleting the check.",
      });
    } else {
      // 🚨 ASSERT THE MATCHER AGAINST REAL PATHS, never against its own spelling.
      // A pattern can look right and behave wrong, and both failure directions
      // cost something real: a path that should be excluded starts a Lambda, and
      // a path that should be matched silently stops refreshing the session,
      // which reads to the person as a random logout.
      const re = new RegExp(`^${matcher.replace(/\\\\/g, "\\")}$`);
      for (const [path, shouldMatch] of MATCHER_CASES) {
        if (re.test(path) !== shouldMatch) {
          findings.push({
            where: "proxy.ts",
            what: `the matcher ${shouldMatch ? "no longer matches" : "now matches"} ${path}`,
            remedy: shouldMatch
              ? "This route needs its session refreshed. A blanket extension rule like " +
                "\\.[a-z]+$ is the usual cause — it eats /c/<slug.with.dot>. Name the extensions."
              : "A bag of bytes has no session to refresh and no first touch worth capturing. " +
                "GET /matrx/favicon-32x32.png was starting a Node Lambda and /blob-sw.js timed " +
                "out at 15s twice. Keep it out of the matcher.",
          });
        }
      }
    }
  }

  return findings;
}

/**
 * Real paths this app serves, and whether the proxy should wake for them.
 * The `false` rows are the ones that were costing a Lambda; the `true` rows are
 * the ones a careless exclusion would silently sign people out of.
 */
const MATCHER_CASES: [string, boolean][] = [
  ["/chat", true],
  ["/chat/a/506a20fc-34a9-4038-b38b-6c71ab09b173", true],
  ["/dashboard", true],
  ["/login", true],
  ["/administration/users", true],
  ["/agents/go/db8a01e2-e1d9-4824-b019-953faf7c0a1e", true],
  ["/education/learn/cell-structure-and-function", true],
  // A creator slug and a share id may legitimately contain a dot.
  ["/c/some.brand", true],
  ["/p/e/fc_set/abc", true],
  ["/matrx/favicon-32x32.png", false],
  ["/blob-sw.js", false],
  ["/styles/app.css", false],
  ["/api/version", false],
  ["/_next/static/chunk.js", false],
];

/**
 * THE SHELL-LAYOUT HALF.
 *
 * `getServerAuth()` is bounded (2.5s, `createAuthBudget` in @ai-matrx/data/next),
 * and a spent budget hands back `user: null` — indistinguishable from a guest.
 * These are the layouts that build `UserData` and decide the shell's posture, so
 * in each of them that null is the difference between "a guest is browsing" and
 * "a signed-in person watches their nav, org switcher, inbox and user menu
 * vanish because the network blinked for two seconds".
 *
 * It does not self-heal. The client re-resolves identity after hydration
 * (`DeferredShellData`) and repairs Redux, but the chrome is driven by a SERVER
 * prop the client never revisits — the guest shell sits there until the next
 * navigation.
 *
 * So every one of these files must READ `authUnavailable`. What it then does is
 * its own call (hold the shell, hold the stage, refuse in place), but silently
 * treating it as a guest is never one of them.
 */
const SHELL_LAYOUTS = [
  "app/(core)/layout.tsx",
  "app/(admin)/layout.tsx",
  "app/(transitional)/layout.tsx",
  "app/(dev)/layout.dev.tsx",
  "app/(meet)/layout.tsx",
  "lib/auth/authedLayoutData.ts",
];

export function auditShellLayouts(files: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  for (const path of SHELL_LAYOUTS) {
    // Absent from the map is not this function's business — `readShellLayouts`
    // owns "the file is gone", because only a read against DISK can tell a
    // deleted layout from a fixture that simply did not supply one.
    const raw = files[path];
    if (raw === undefined) continue;
    const body = code(raw);
    // A file that does not resolve identity at all has nothing to get wrong.
    if (!/getServerAuth\s*\(/.test(body)) continue;
    if (/authUnavailable/.test(body)) continue;
    findings.push({
      where: path,
      what: "builds the shell from getServerAuth() but never reads authUnavailable",
      remedy:
        "A null user here is EITHER a guest OR an identity resolve that hit its 2.5s budget, " +
        "and this file cannot tell them apart without the flag. Destructure it — " +
        "`const { user, isAuthenticated, authUnavailable } = await getServerAuth()` — and when it " +
        "is set, hold rather than rendering the signed-out shell or redirecting to /login. " +
        "The client cannot fix it for you: the chrome is a server prop it never revisits.",
    });
  }
  return findings;
}

const WATCHED = [
  "proxy.ts",
  "utils/supabase/middleware.ts",
  "utils/supabase/authCookie.ts",
  "utils/supabase/resolveUser.ts",
];

/**
 * THE API-ROUTE HALF.
 *
 * Every `app/api/**\/route.ts` is the same hot path as the proxy: one HTTP
 * request, one identity resolve, and `getUser()` makes that an auth-server
 * round trip. Nothing dedupes them — React `cache()` is a no-op outside a
 * render — so a route that resolves the caller three times pays three times.
 * 134 calls across 104 files went to `getClaimsUser()` on 2026-09-20; there is
 * no baseline, so any finding here is NEW.
 *
 * The exemptions are real: the JWT carries no `created_at`, `updated_at`,
 * `identities`, `last_sign_in_at`, `factors` or `*_confirmed_at`, so a route
 * that reads one of those MUST keep `getUser()` — add it to ALLOWED with the
 * field it reads. `auth.admin.getUserById()` is a different call (a service-role
 * lookup of SOMEONE ELSE) and is never flagged.
 */
const API_ROUTE_ALLOWED: Record<string, string> = {
  // path -> why this route still needs the auth server
  "app/api/user/profile/route.ts":
    "PATCH echoes user_metadata back AFTER auth.updateUser wrote it. The JWT's " +
    "user_metadata claim is a snapshot from token issuance and updateUser does not " +
    "reissue the token, so a claims read would echo the OLD name and avatar at the " +
    "client that just changed them. The caller resolve in the same file IS on " +
    "getClaimsUser; only the echo read is exempt.",
};

export function auditApiRoutes(
  files: Record<string, string>,
  allowed: Record<string, string> = API_ROUTE_ALLOWED,
): Finding[] {
  const findings: Finding[] = [];

  for (const [path, raw] of Object.entries(files)) {
    if (path in allowed) continue;
    const body = code(raw);
    // `.auth.admin.getUserById(...)` looks up another user by id with the
    // service role. Only the caller-identity read is the hot-path defect.
    if (!/\.auth\s*\.\s*getUser\s*\(/.test(body)) continue;

    findings.push({
      where: path,
      what: "calls auth.getUser() in an API route — an auth-server round trip per HTTP request",
      remedy:
        'Use `getClaimsUser(client)` from "@/utils/supabase/resolveUser" — the same ' +
        "`{ data: { user }, error }` envelope, verified locally against the cached JWKS. " +
        "For a route that takes a Bearer token, `resolveUser(request)` is the door. " +
        "If this route genuinely reads created_at / updated_at / identities / " +
        "last_sign_in_at / factors / *_confirmed_at — none of which are in the JWT — add it " +
        "to API_ROUTE_ALLOWED in this script, naming the field.",
    });
  }

  for (const path of Object.keys(allowed)) {
    if (path in files && /\.auth\s*\.\s*getUser\s*\(/.test(code(files[path]))) continue;
    findings.push({
      where: path,
      what: "is exempted in API_ROUTE_ALLOWED but no longer calls auth.getUser()",
      remedy: "Delete the entry. A stale exemption hides the next real one.",
    });
  }

  return findings;
}

/** Every `route.ts` under `app/api`, keyed by repo-relative path. */
function readApiRoutes(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name === "route.ts") out[relative(ROOT, abs)] = readFileSync(abs, "utf8");
    }
  };
  const apiRoot = join(ROOT, "app", "api");
  if (existsSync(apiRoot)) walk(apiRoot);
  return out;
}


/**
 * THE WHOLE-REPO HALF — added 2026-09-21, the day the proxy fix from the day
 * before was found to have left every LAYOUT on the old round trip.
 *
 * The proxy and the API routes were guarded; `app/(core)/layout.tsx`,
 * `getServerAuth()`, 80-odd `features/** /service.ts` and Server Actions were
 * not, and a locked database turned each of their `getUser()` calls into a 15s
 * Lambda timeout. So the rule is now the whole tree, by construction:
 *
 *  - `.auth.getUser(` may appear ONLY in the doors named in `GETUSER_DOORS`.
 *  - `fetchAuthUserRecord` (what those doors export) may be imported ONLY by
 *    the callers named in `RECORD_DOOR_CALLERS`, each with its reason.
 *  - A server file that calls `.auth.getSession(` may not read `.user` off it:
 *    that session is whatever the cookie says, unverified. Identity comes from
 *    `getServerAuth()` / `getClaimsUser()`.
 *
 * Tests and fakes are not swept; they are allowed to model the old call.
 */
const GETUSER_DOORS: Record<string, string> = {
  "utils/supabase/authUserRecord.ts":
    "THE server door to the auth-server user record (read-after-write only).",
  "utils/supabase/authUserRecord.client.ts":
    "THE browser door to the auth-server user record (created_at, identities, " +
    "last_sign_in_at, *_confirmed_at) — once per browser session, after hydration.",
  "app/api/user/profile/route.ts":
    "PATCH echoes user_metadata back AFTER auth.updateUser wrote it; the JWT's " +
    "user_metadata is a snapshot from issuance. Kept inline (see API_ROUTE_ALLOWED).",
};

const RECORD_DOOR_CALLERS: Record<string, string> = {
  "features/shell/components/DeferredShellData.tsx":
    "Fills the Redux user with the record-only fields ONCE after hydration of the " +
    "signed-in shell; every profile / menu surface reads them from Redux.",
  "hooks/usePublicAuthSync.ts":
    "The same fill for public routes, once, after the local session check.",
};

const SWEPT_ROOTS = ["app", "features", "lib", "utils", "components", "hooks", "providers", "actions", "config"];
const SWEPT_EXT = /\.(ts|tsx)$/;
const NOT_SWEPT = /(\.test\.|\.spec\.|\.stories\.|\.d\.ts$|(^|\/)__tests__\/|(^|\/)__mocks__\/|(^|\/)test-utils\/|(^|\/)node_modules\/)/;

export function auditRepoIdentityCalls(
  files: Record<string, string>,
  doors: Record<string, string> = GETUSER_DOORS,
  callers: Record<string, string> = RECORD_DOOR_CALLERS,
): Finding[] {
  const findings: Finding[] = [];
  for (const [path, raw] of Object.entries(files)) {
    if (NOT_SWEPT.test(path)) continue;
    const body = code(raw);

    if (/\.auth\s*\.\s*getUser\s*\(/.test(body) && !(path in doors)) {
      findings.push({
        where: path,
        what: "calls auth.getUser() outside the one allow-listed door — an auth-server round trip",
        remedy:
          "Server: `const { user, isAuthenticated, authUnavailable } = await getServerAuth()` " +
          "(layouts, pages, Server Actions, services) or `getClaimsUser(client)` when you " +
          "already hold a client. Browser: `getClaimsUser(createClient())`, or read the user " +
          "from Redux. Need created_at / identities / last_sign_in_at / *_confirmed_at? They " +
          "arrive in Redux via fetchAuthUserRecord from DeferredShellData; read them there. " +
          "A read-after-write of auth.updateUser is the ONLY reason to add a door here.",
      });
    }

    const importsDoor = /from\s+["'][^"']*utils\/supabase\/authUserRecord(\.client)?["']/.test(body);
    if (importsDoor && !(path in callers) && !(path in doors)) {
      findings.push({
        where: path,
        what: "imports fetchAuthUserRecord but is not an allow-listed caller of the record door",
        remedy:
          "The record door is for the fields the JWT does not carry, read ONCE after hydration " +
          "by the shell. Read them from Redux instead. If this surface truly must go to the " +
          "auth server itself, add it to RECORD_DOOR_CALLERS in this script with the reason.",
      });
    }

    // Server code only: a browser hook reading `getSession().user` is the
    // ordinary local session read. "Server" here means the file reaches for
    // the server client or Next's request headers, or declares "use server".
    const isServerFile =
      /from\s+["']@\/utils\/supabase\/server["']/.test(body) ||
      /from\s+["']next\/headers["']/.test(body) ||
      /^\s*["']use server["']/m.test(body);
    if (
      isServerFile &&
      /\.auth\s*\.\s*getSession\s*\(/.test(body) &&
      /\bsession\??\.user\b|\bdata\.session\??\.user\b/.test(body) &&
      !/^\s*["']use client["']/m.test(body)
    ) {
      findings.push({
        where: path,
        what: "reads `.user` off auth.getSession() on the server — an UNVERIFIED identity, and a hidden refresh round trip",
        remedy:
          "getSession() believes whatever the cookie says and may trigger a token refresh. Decide " +
          "identity with getServerAuth() / getClaimsUser(client); keep getSession() only for the " +
          "access token string.",
      });
    }
  }

  for (const path of Object.keys(doors)) {
    if (!(path in files)) continue;
    if (/\.auth\s*\.\s*getUser\s*\(/.test(code(files[path]))) continue;
    findings.push({
      where: path,
      what: "is named in GETUSER_DOORS but no longer calls auth.getUser()",
      remedy: "Delete the entry. A stale door hides the next real one.",
    });
  }
  for (const path of Object.keys(callers)) {
    if (!(path in files)) continue;
    if (/authUserRecord/.test(code(files[path]))) continue;
    findings.push({
      where: path,
      what: "is named in RECORD_DOOR_CALLERS but no longer uses the record door",
      remedy: "Delete the entry. A stale exemption hides the next real one.",
    });
  }
  return findings;
}

/** Every swept `.ts`/`.tsx` in the repo, keyed by repo-relative path. */
function readSweptFiles(): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        walk(abs);
      } else if (SWEPT_EXT.test(entry.name)) {
        out[relative(ROOT, abs)] = readFileSync(abs, "utf8");
      }
    }
  };
  for (const root of SWEPT_ROOTS) {
    const abs = join(ROOT, root);
    if (existsSync(abs)) walk(abs);
  }
  return out;
}

/**
 * The matcher this repo actually ships. The "clean" fixtures use it verbatim so a
 * self-test pass means the real pattern satisfies MATCHER_CASES — a toy matcher
 * would let the table drift away from production without anyone noticing.
 */
const REAL_MATCHER_FIXTURE =
  'export const config = { matcher: ["/((?!api|_next/static|_next/image|public|auth|app_redirect|app_callback|favicon.ico|sitemap.xml|robots.txt|manifest.webmanifest|.*\\\\.(?:js|mjs|css|map|json|txt|xml|svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2|ttf|otf|eot|mp3|mp4|webm|wasm|pdf)$).*)"] };';

/**
 * Read the shell layouts off disk — and make a MISSING one a finding rather
 * than a silent skip. A rename or a delete would otherwise void the rule with
 * nobody noticing, which reads as coverage this guard is not giving.
 */
function readShellLayouts(): {
  shellLayouts: Record<string, string>;
  missingLayouts: Finding[];
} {
  const shellLayouts: Record<string, string> = {};
  const missingLayouts: Finding[] = [];
  for (const rel of SHELL_LAYOUTS) {
    const abs = join(ROOT, rel);
    if (existsSync(abs)) {
      shellLayouts[rel] = readFileSync(abs, "utf8");
      continue;
    }
    missingLayouts.push({
      where: rel,
      what: "is named as a shell layout but no longer exists",
      remedy:
        "If it moved, update SHELL_LAYOUTS to the new path. If the group is gone, remove the " +
        "entry. Do not leave a stale row — it reads as coverage this guard is not giving.",
    });
  }
  return { shellLayouts, missingLayouts };
}

function selfTest(): boolean {
  const cases: [string, Record<string, string>, number][] = [
    [
      "clean tree",
      {
        "proxy.ts": REAL_MATCHER_FIXTURE,
        "utils/supabase/middleware.ts": "if (session.authUnavailable) return session.response;",
      },
      0,
    ],
    [
      "getUser() returns to the proxy path",
      {
        "proxy.ts": REAL_MATCHER_FIXTURE,
        "utils/supabase/middleware.ts":
          "const { data } = await client.auth.getUser(); if (session.authUnavailable) return x;",
      },
      1,
    ],
    [
      "the app stops reading authUnavailable",
      {
        "proxy.ts": REAL_MATCHER_FIXTURE,
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
      // One finding per real path that would now wake a Lambda:
      // /matrx/favicon-32x32.png, /blob-sw.js, /styles/app.css.
      3,
    ],
    [
      "a shell layout that holds on authUnavailable is clean",
      {
        "app/(core)/layout.tsx":
          "const { user, isAuthenticated, authUnavailable } = await getServerAuth();\n" +
          "if (authUnavailable) return <AppShell>held</AppShell>;",
      },
      0,
    ],
    [
      "a shell layout that ignores authUnavailable is caught",
      {
        "app/(core)/layout.tsx":
          "const { user, isAuthenticated } = await getServerAuth();\n" +
          "if (!user) return <AppShell isAuthenticated={false} />;",
      },
      1,
    ],
    [
      "authUnavailable named only in a COMMENT does not satisfy the rule",
      {
        "app/(meet)/layout.tsx":
          "// TODO: read authUnavailable one day\n" +
          "const { user } = await getServerAuth();",
      },
      1,
    ],
    [
      "a layout that resolves no identity at all is not flagged",
      { "app/(meet)/layout.tsx": "export default function L({ children }) { return children; }" },
      0,
    ],
    [
      "a comment NAMING getUser is not a call",
      {
        "proxy.ts": REAL_MATCHER_FIXTURE,
        "utils/supabase/middleware.ts":
          "// never call client.auth.getUser() here\nif (session.authUnavailable) return session.response;",
      },
      0,
    ],
  ];

  const routeCases: [string, Record<string, string>, number, Record<string, string>?][] = [
    [
      "an API route on getClaimsUser is clean",
      {
        "app/api/whoami/route.ts":
          'import { getClaimsUser } from "@/utils/supabase/resolveUser";\n' +
          "const { data: { user } } = await getClaimsUser(supabase);",
      },
      0,
    ],
    [
      "getUser() returns to an API route",
      {
        "app/api/whoami/route.ts": "const { data: { user } } = await supabase.auth.getUser();",
      },
      1,
    ],
    [
      "a Bearer-token route calling getUser(token) is caught too",
      {
        "app/api/extension/append-message/route.ts":
          "const { data, error } = await bearerClient.auth.getUser(token);",
      },
      1,
    ],
    [
      "auth.admin.getUserById() is a different call and is never flagged",
      {
        "app/api/feedback/notify/route.ts":
          "const { data } = await admin.auth.admin.getUserById(feedback.user_id);",
      },
      0,
    ],
    [
      "a comment NAMING getUser in a route is not a call",
      {
        "app/api/whoami/route.ts":
          "// getClaimsUser replaced supabase.auth.getUser() here\nconst x = 1;",
      },
      0,
    ],
    [
      "an allowed route really does keep getUser()",
      { "app/api/legacy/route.ts": "const { data } = await supabase.auth.getUser(); user.created_at;" },
      0,
      { "app/api/legacy/route.ts": "reads created_at" },
    ],
    [
      "a stale API_ROUTE_ALLOWED entry is itself a finding",
      { "app/api/legacy/route.ts": "const { data } = await getClaimsUser(supabase);" },
      1,
      { "app/api/legacy/route.ts": "reads created_at" },
    ],
  ];

  const repoCases: [string, Record<string, string>, number][] = [
    [
      "a layout on getServerAuth is clean",
      { "app/(core)/data/layout.tsx": 'import { getServerAuth } from "@/utils/supabase/getServerAuth";\nconst { isAuthenticated } = await getServerAuth();' },
      0,
    ],
    [
      "getUser() in a layout is caught",
      { "app/(core)/data/layout.tsx": "const { data: { user } } = await supabase.auth.getUser();" },
      1,
    ],
    [
      "getUser() in a feature service is caught",
      { "features/hr/service.ts": "const { data } = await supabase.auth.getUser();" },
      1,
    ],
    [
      "getUser() in a Client Component is caught too — the browser has getClaims",
      { "features/x/Thing.tsx": '"use client";\nconst { data } = await supabase.auth.getUser();' },
      1,
    ],
    [
      "the doors themselves are allowed",
      {
        "utils/supabase/authUserRecord.ts": "const { data, error } = await client.auth.getUser();",
        "utils/supabase/authUserRecord.client.ts": "const { data, error } = await createClient().auth.getUser();",
      },
      0,
    ],
    [
      "a door that stopped calling getUser is a stale entry",
      { "utils/supabase/authUserRecord.ts": "export const x = 1;" },
      1,
    ],
    [
      "an allow-listed caller may import the record door",
      { "features/shell/components/DeferredShellData.tsx": 'import { fetchAuthUserRecord } from "@/utils/supabase/authUserRecord.client";\nawait fetchAuthUserRecord();' },
      0,
    ],
    [
      "any other importer of the record door is caught",
      { "features/profile/Page.tsx": 'import { fetchAuthUserRecord } from "@/utils/supabase/authUserRecord.client";' },
      1,
    ],
    [
      "server code deciding identity from getSession().user is caught",
      { "features/y/service.ts": 'import { createClient } from "@/utils/supabase/server";\nconst { data: { session } } = await supabase.auth.getSession(); if (!session?.user) throw x;' },
      1,
    ],
    [
      "a browser hook reading getSession().user is the ordinary local read",
      { "hooks/useGuestLimit.ts": "supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));" },
      0,
    ],
    [
      "getSession() for the access token alone is fine",
      { "app/(core)/layout.tsx": "const { data: { session } } = await supabase.auth.getSession(); const t = session?.access_token;" },
      0,
    ],
    [
      "tests and fakes are not swept",
      { "utils/supabase/middleware.test.ts": "getUser: async () => supabase.auth.getUser()", "test-utils/supabase-auth.ts": "auth.getUser()" },
      0,
    ],
    [
      "a comment NAMING getUser is not a call",
      { "features/z/service.ts": "// we used to call supabase.auth.getUser() here\nconst x = 1;" },
      0,
    ],
  ];

  let ok = true;
  for (const [name, files, expected] of cases) {
    const got = auditProxyAuth(files).length + auditShellLayouts(files).length;
    const pass = got === expected;
    if (!pass) ok = false;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name} — expected ${expected}, got ${got}`);
  }
  for (const [name, files, expected, allowed] of routeCases) {
    const got = auditApiRoutes(files, allowed ?? {}).length;
    const pass = got === expected;
    if (!pass) ok = false;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name} — expected ${expected}, got ${got}`);
  }
  for (const [name, files, expected] of repoCases) {
    const got = auditRepoIdentityCalls(files).length;
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
    exitAfterDrain(ok ? 0 : 1);
  }

  const files: Record<string, string> = {};
  for (const rel of WATCHED) {
    const abs = join(ROOT, rel);
    if (existsSync(abs)) files[rel] = readFileSync(abs, "utf8");
  }

  // Read SEPARATELY from WATCHED, on purpose. `auditProxyAuth`'s getSession()
  // rule is a PROXY-PATH rule — there, getSession() decides access and must
  // never be trusted. These layouts call it for the access token AFTER identity
  // is already settled from the JWT, which is the ordinary, correct read (the
  // repo-wide sweep draws the same distinction). Feeding them to auditProxyAuth
  // would report all six as findings and teach the next agent to ignore this
  // guard.
  const { shellLayouts, missingLayouts } = readShellLayouts();

  const apiRoutes = readApiRoutes();
  const swept = readSweptFiles();
  const findings = [
    ...auditProxyAuth(files),
    ...auditShellLayouts(shellLayouts),
    ...missingLayouts,
    ...auditApiRoutes(apiRoutes),
    ...auditRepoIdentityCalls(swept),
  ];
  if (findings.length === 0) {
    console.log(
      "check:proxy-auth-hot-path — OK. The proxy resolves identity locally, " +
        "bounded, and reads authUnavailable; the matcher leaves static bytes alone. " +
        `All ${Object.keys(apiRoutes).length} app/api routes resolve the caller from the JWT, ` +
        `and across ${Object.keys(swept).length} swept files auth.getUser() exists only behind ` +
        `the ${Object.keys(GETUSER_DOORS).length} named doors.`,
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
  if (STRICT) exitAfterDrain(1);
}

main();
