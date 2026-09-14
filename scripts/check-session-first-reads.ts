/**
 * check-session-first-reads — NO AUTHENTICATED READ LEAVES THE CLIENT BEFORE
 * THE SESSION IS ATTACHED, and nothing quietly opts out of that (DD-237).
 *
 * THE CLASS THIS GUARDS
 * ---------------------
 * `supabase-js` attaches the caller's JWT inside its own fetch, and when
 * `auth.getSession()` yields nothing it silently sends the PUBLISHABLE key
 * instead. PostgREST then runs the statement as `anon`, which holds no grant on
 * any application table in this database, and the read comes back
 * `42501 permission denied` at HTTP 401 — a refusal that looked, to every lane
 * that met it, exactly like a real grant gap. Measured on production over the
 * 48 h to 2026-09-14: 59 such rows across 28 relations, and not one of them was
 * retried or shown to the reader.
 *
 * The fix is ONE barrier in the ONE proxy the browser client is wrapped in
 * (`lib/diagnostics/supabaseErrorCapture.ts` → `utils/supabase/sessionBarrier.ts`),
 * so all ~1,000 call sites inherit it. That only stays true while two things
 * hold, and this guard is what holds them:
 *
 *   1. THE SEAMS ARE THERE. The wrapper installs the barrier and calls both of
 *      its seams — the bounded wait before the request and the one retry after
 *      a refusal that carried no identity. Delete either and every browser read
 *      silently loses the barrier while every test in the repo stays green.
 *   2. NOTHING ROUTES AROUND IT. Browser code gets its Supabase client from the
 *      sanctioned door (`@/utils/supabase/client`, which is the wrapped
 *      singleton). A module that builds its own browser client — with
 *      `createBrowserClient` or by reaching past the binding for
 *      `supabaseNext.browserClient()` — gets an UNWRAPPED client: no barrier,
 *      and no error capture either.
 *
   3. THE PACKAGES INHERIT IT TOO. An `@ai-matrx/*` package is handed the host's
 *      client; only ONE of them may build a browser client of its own —
 *      `@ai-matrx/data`, which is the very thing `authCookie.ts` binds the
 *      wrapper into. Any other published package that reaches for
 *      `@supabase/ssr` at run time would be issuing reads through a client this
 *      app never wrapped, from inside `node_modules`, where no source scan in
 *      this repo would ever see them.
 *   4. AND NO HOST TELLS A PACKAGE WHO THE USER IS (DD-240). A user id handed
 *      across a package boundary is a COPY, and a copy goes stale the moment the
 *      domain-wide auth cookie rotates: `<MeetProvider userId={selectUserId}>`
 *      kept naming an account its tab could no longer prove it was, and
 *      `communication.meet_pending_call_invites` refused those reads at 403
 *      ("the acting user … is not the authenticated user") in tabs 8.8 h and
 *      32.9 h old. A package derives identity from the session of the client it
 *      was given, or — where a prop still exists — the host proves the id
 *      against the live session in the same file before passing it. Nothing else.
 *
 * Plus the declaration rule: the only way a door opts OUT of the wait is by
 * name, in `utils/supabase/anonymousByDesignDoors.ts`, WITH the purpose that
 * says which caller with no account reaches it. That list mirrors the database's
 * own `platform.client_callable_door.anonymous_callers` and can never widen
 * access — but a nameless entry would turn it into a silent bypass, so an entry
 * without a real purpose fails here.
 *
 * Run:  pnpm check:session-first-reads
 *       pnpm check:session-first-reads --self-test   (proves it can FAIL)
 * Exit 1 on any violation; exit 2 on unexpected errors.
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = resolve(__dirname, "..");

/** The ONE proxy every browser Supabase call passes through. */
const WRAPPER_FILE = "lib/diagnostics/supabaseErrorCapture.ts";
/** Where the wrapper is bound to this app's identity. */
const BINDING_FILE = "utils/supabase/authCookie.ts";
/** The named opt-out registry. */
const DOORS_FILE = "utils/supabase/anonymousByDesignDoors.ts";

/**
 * The only files allowed to construct or reach for a browser Supabase client.
 * `client.ts` is the door every feature imports; `debugClient.ts` is the dev
 * logging proxy over the same singleton; `authCookie.ts` is the binding that
 * installs the wrapper in the first place.
 */
const SANCTIONED_CONSTRUCTORS = new Set([
  "utils/supabase/client.ts",
  "utils/supabase/debugClient.ts",
  "utils/supabase/authCookie.ts",
]);

const SCAN_DIRS = ["app", "features", "components", "providers", "hooks", "lib", "utils"];

/**
 * The ONE published package allowed to construct a browser Supabase client: it
 * is the implementation `utils/supabase/authCookie.ts` binds `wrapClientForCapture`
 * into, so its client IS the wrapped one.
 */
const PACKAGE_ALLOWED_TO_BUILD_A_CLIENT = "@ai-matrx/data";

/**
 * Props that hand an identity across a package boundary and END UP AS A
 * DATABASE ARGUMENT (DD-240) — the shape the database compares against
 * `auth.uid()` and refuses at 403 when the copy has gone stale.
 *
 * `actorId` is deliberately NOT here. `@ai-matrx/realtime` uses it for write-
 * ledger echo suppression (`input.updatedBy === actorId`) and never sends it to
 * the database, so a stale one mis-attributes an echo — a different, smaller
 * defect with a different owner, and calling it this one would make this rule
 * mean less, not more.
 */
const IDENTITY_PROPS = ["userId", "currentUserId", "authUserId"] as const;
const SKIP_DIR = new Set(["node_modules", ".next", "dist", "build"]);

/** Ways to obtain a browser Supabase client that does NOT go through the door. */
const BROWSER_CLIENT_CONSTRUCTORS = [
  "createBrowserClient(",
  "browserClient()",
];

/** The three seams that make the barrier real, by name. */
const REQUIRED_SEAMS = [
  "installSessionBarrier(",
  "canSendImmediately(",
  "awaitSessionBeforeSend(",
  "recoverSessionForRetry(",
  "isSessionRefusal(",
  "sessionStateMarker(",
] as const;

/**
 * Strip comments before matching, for the reason check-org-refusal-honesty
 * learned the hard way: a guard that reads documentation as code teaches people
 * to delete the documentation.
 */
export function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Which seams is the wrapper missing? Empty means the barrier is wired. */
export function missingSeams(rawWrapperSource: string): string[] {
  const source = stripComments(rawWrapperSource);
  return REQUIRED_SEAMS.filter((seam) => !source.includes(seam));
}

/** Is the wrapper still the browser client's wrapper? */
export function bindingInstallsWrapper(rawBindingSource: string): boolean {
  const source = stripComments(rawBindingSource);
  return /wrapBrowserClient\s*:\s*wrapClientForCapture/.test(source);
}

/** Does this file build a browser Supabase client of its own? */
export function constructsBrowserClient(rawSource: string): boolean {
  const source = stripComments(rawSource);
  return BROWSER_CLIENT_CONSTRUCTORS.some((needle) => source.includes(needle));
}

/**
 * Every declared anonymous door must say, in words, which caller with no
 * account reaches it. Returns the names that do not.
 */
export function undeclaredDoors(rawDoorsSource: string): string[] {
  const source = stripComments(rawDoorsSource);
  const bad: string[] = [];
  const entry = /name:\s*"([^"]+)"\s*,\s*purpose:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(source)) !== null) {
    const purpose = match[2].replace(/"\s*\+\s*"/g, "").replace(/"/g, "").trim();
    if (purpose.length < 20) bad.push(match[1]);
  }
  return bad;
}

/**
 * A host file that hands an identity to an `@ai-matrx/*` component without
 * proving it against the live session in the same file (DD-240). Returns
 * `Component.prop` for every such hand-off.
 *
 * "Proving it" means what `providers/MessagingHost.tsx` does: read
 * `auth.getSession()`, subscribe to `auth.onAuthStateChange`, and pass the id
 * only while the two sources agree. A file that does neither is passing a copy
 * of client state, which is the defect.
 */
export function unverifiedIdentityHandoffs(rawSource: string): string[] {
  const source = stripComments(rawSource);
  const imported = new Set<string>();
  const importFrom = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@ai-matrx\/[^"']+["']/g;
  let match: RegExpExecArray | null;
  while ((match = importFrom.exec(source)) !== null) {
    for (const piece of match[1].split(",")) {
      const name = piece.split(/\s+as\s+/).pop()?.trim().replace(/^type\s+/, "");
      if (name !== undefined && /^[A-Z]/.test(name)) imported.add(name);
    }
  }
  if (imported.size === 0) return [];

  const provesAgainstTheSession =
    /auth\.onAuthStateChange\s*\(/.test(source) && /auth\.getSession\s*\(/.test(source);

  const found: string[] = [];
  for (const component of imported) {
    const tag = new RegExp(`<${component}\\b([^>]*)>`, "g");
    let opening: RegExpExecArray | null;
    while ((opening = tag.exec(source)) !== null) {
      for (const prop of IDENTITY_PROPS) {
        if (!new RegExp(`\\b${prop}\\s*=`).test(opening[1])) continue;
        if (provesAgainstTheSession) continue;
        found.push(`${component}.${prop}`);
      }
    }
  }
  return [...new Set(found)].sort();
}

/** Does this published package build a browser Supabase client of its own? */
export function packageBuildsItsOwnClient(rawSource: string): boolean {
  return (
    /createBrowserClient\s*\(/.test(rawSource) ||
    /(?:from|require\()\s*["']@supabase\/(?:ssr|supabase-js)["']/.test(rawSource)
  );
}

function* walkDist(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) yield* walkDist(full);
    else if (/\.(js|cjs|mjs)$/.test(entry)) yield full;
  }
}

/**
 * Every `@ai-matrx/*` package installed here, checked in its PUBLISHED bytes —
 * the ones this app actually runs. Reading the source in another repo would
 * prove nothing about what is in `node_modules`.
 */
export function packagesBuildingTheirOwnClient(root: string): string[] {
  const scope = join(root, "node_modules", "@ai-matrx");
  let packages: string[];
  try {
    packages = readdirSync(scope);
  } catch {
    return [];
  }
  const offenders: string[] = [];
  for (const name of packages) {
    if (`@ai-matrx/${name}` === PACKAGE_ALLOWED_TO_BUILD_A_CLIENT) continue;
    for (const file of walkDist(join(scope, name, "dist"))) {
      if (packageBuildsItsOwnClient(readFileSync(file, "utf8"))) {
        offenders.push(`@ai-matrx/${name} (${relative(scope, file)})`);
        break;
      }
    }
  }
  return offenders.sort();
}

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIR.has(entry)) continue;
    const full = join(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

interface Findings {
  seams: string[];
  bindingBroken: boolean;
  rogueClients: string[];
  roguePackages: string[];
  identityHandoffs: string[];
  namelessDoors: string[];
  missingFiles: string[];
}

function scan(): Findings {
  const findings: Findings = {
    seams: [],
    bindingBroken: false,
    rogueClients: [],
    roguePackages: [],
    identityHandoffs: [],
    namelessDoors: [],
    missingFiles: [],
  };

  for (const required of [WRAPPER_FILE, BINDING_FILE, DOORS_FILE]) {
    if (!existsSync(join(ROOT, required))) findings.missingFiles.push(required);
  }
  if (findings.missingFiles.length > 0) return findings;

  findings.seams = missingSeams(readFileSync(join(ROOT, WRAPPER_FILE), "utf8"));
  findings.bindingBroken = !bindingInstallsWrapper(
    readFileSync(join(ROOT, BINDING_FILE), "utf8"),
  );
  findings.namelessDoors = undeclaredDoors(
    readFileSync(join(ROOT, DOORS_FILE), "utf8"),
  );

  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file);
      const source = readFileSync(file, "utf8");
      for (const handoff of unverifiedIdentityHandoffs(source)) {
        findings.identityHandoffs.push(`${rel}: <${handoff.replace(".", " ")}={…}>`);
      }
      if (SANCTIONED_CONSTRUCTORS.has(rel)) continue;
      if (constructsBrowserClient(source)) {
        findings.rogueClients.push(rel);
      }
    }
  }
  findings.rogueClients.sort();
  findings.identityHandoffs.sort();
  findings.roguePackages = packagesBuildingTheirOwnClient(ROOT);
  return findings;
}

/**
 * Prove the check can fail. A guard nobody has watched fail is not a guard, so
 * this plants each of the three shapes that would silently reopen DD-237 and
 * asserts the rule flags every one, then asserts the compliant shapes pass.
 */
function selfTest(): number {
  const checks: Array<[string, boolean]> = [];

  // 1. The wrapper loses a seam — every browser read silently loses the barrier.
  const wiredWrapper = readFileSync(join(ROOT, WRAPPER_FILE), "utf8");
  const unwiredWrapper = wiredWrapper
    .replace(/installSessionBarrier\(/g, "noop(")
    .replace(/awaitSessionBeforeSend\(/g, "noop(");
  checks.push(["wired wrapper passes", missingSeams(wiredWrapper).length === 0]);
  checks.push([
    "wrapper with the seams removed is flagged",
    missingSeams(unwiredWrapper).length === 2,
  ]);

  // 2. The binding stops wrapping the browser client at all.
  checks.push([
    "live binding passes",
    bindingInstallsWrapper(readFileSync(join(ROOT, BINDING_FILE), "utf8")),
  ]);
  checks.push([
    "binding without the wrapper is flagged",
    !bindingInstallsWrapper(
      `export const supabaseNext = createNextSupabase({ apexDomain: "aimatrx.com" });`,
    ),
  ]);

  // 3. A feature builds its own browser client and inherits nothing.
  checks.push([
    "a feature reaching for its own browser client is flagged",
    constructsBrowserClient(`
      import { supabaseNext } from "@/utils/supabase/authCookie";
      const db = supabaseNext.browserClient();
      export const rows = () => db.from("kind_component").select("*");
    `),
  ]);
  checks.push([
    "a feature building a raw browser client is flagged",
    constructsBrowserClient(`
      import { createBrowserClient } from "@supabase/ssr";
      const db = createBrowserClient(url, key);
    `),
  ]);
  checks.push([
    "a feature using the sanctioned door passes",
    !constructsBrowserClient(`
      import { supabase } from "@/utils/supabase/client";
      export const rows = () => supabase.from("kind_component").select("*");
    `),
  ]);

  // 5. A host tells a package who the user is, with nothing checking it.
  checks.push([
    "an unverified identity hand-off to a package is flagged",
    unverifiedIdentityHandoffs(`
      import { MeetProvider } from "@ai-matrx/meet/react";
      import { selectUserId } from "@/lib/redux/selectors/userSelectors";
      export function Host({ children }) {
        const userId = useAppSelector(selectUserId);
        return <MeetProvider client={supabase} userId={userId}>{children}</MeetProvider>;
      }
    `).length === 1,
  ]);
  checks.push([
    "an identity proven against the live session in the same file passes",
    unverifiedIdentityHandoffs(`
      import { MessagingProvider } from "@ai-matrx/messaging/react";
      export function Host({ children }) {
        useEffect(() => {
          void supabase.auth.getSession().then(({ data }) => setSessionUserId(data.session?.user.id ?? null));
          const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessionUserId(s?.user.id ?? null));
          return () => data.subscription.unsubscribe();
        }, []);
        return <MessagingProvider userId={verified}>{children}</MessagingProvider>;
      }
    `).length === 0,
  ]);
  checks.push([
    "the live tree hands no unverified identity to any package",
    scan().identityHandoffs.length === 0,
  ]);

  // 6. A published package builds a browser client of its own.
  checks.push([
    "a package reaching for @supabase/ssr is flagged",
    packageBuildsItsOwnClient(`import { createBrowserClient } from "@supabase/ssr";`),
  ]);
  checks.push([
    "a package that only accepts the host's client passes",
    !packageBuildsItsOwnClient(`export function createMeetRepository({ client }) { return client; }`),
  ]);
  checks.push([
    "the installed packages build no client of their own",
    packagesBuildingTheirOwnClient(ROOT).length === 0,
  ]);

  // 4. A door opts out of the wait without saying who reaches it.
  checks.push([
    "a nameless anonymous door is flagged",
    undeclaredDoors(`{ schema: "public", name: "trash_list", purpose: "todo" },`)
      .length === 1,
  ]);
  checks.push([
    "the live door registry passes",
    undeclaredDoors(readFileSync(join(ROOT, DOORS_FILE), "utf8")).length === 0,
  ]);

  let failed = 0;
  for (const [label, ok] of checks) {
    console.log(`[self-test] ${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed += 1;
  }
  if (failed > 0) {
    console.error(`SELF-TEST FAILED: ${failed} of ${checks.length} expectations.`);
    return 1;
  }
  console.log(
    `[self-test] PASS — the rule fails on every shape of the defect and passes on the fix.`,
  );
  return 0;
}

function main(): number {
  if (process.argv.includes("--self-test")) return selfTest();
  const f = scan();

  if (f.missingFiles.length > 0) {
    console.error(
      `check-session-first-reads: the session barrier's own files are gone:\n  ${f.missingFiles.join("\n  ")}`,
    );
    return 1;
  }

  const problems: string[] = [];
  if (f.seams.length > 0) {
    problems.push(
      `${WRAPPER_FILE} no longer calls ${f.seams.length} of the barrier's seams (${f.seams.join(", ")}).\n` +
        `  Every browser read would lose the DD-237 barrier while every test stayed green.`,
    );
  }
  if (f.bindingBroken) {
    problems.push(
      `${BINDING_FILE} no longer passes \`wrapBrowserClient: wrapClientForCapture\`.\n` +
        `  The browser client would carry neither the session barrier nor error capture.`,
    );
  }
  if (f.rogueClients.length > 0) {
    problems.push(
      `${f.rogueClients.length} module(s) build a browser Supabase client outside the sanctioned door,\n` +
        `  so their reads inherit no barrier and no error capture:\n` +
        f.rogueClients.map((file) => `    ${file}`).join("\n") +
        `\n  Import { supabase } from "@/utils/supabase/client" instead.`,
    );
  }
  if (f.identityHandoffs.length > 0) {
    problems.push(
      `${f.identityHandoffs.length} hand-off(s) tell an @ai-matrx package who the user is, with nothing\n` +
        `  proving that id against the live session in the same file (DD-240):\n` +
        f.identityHandoffs.map((line) => `    ${line}`).join("\n") +
        `\n  A package derives identity from the session of the client it was given. Delete the prop,\n` +
        `  or prove it the way providers/MessagingHost.tsx does before passing it.`,
    );
  }
  if (f.roguePackages.length > 0) {
    problems.push(
      `${f.roguePackages.length} installed @ai-matrx package(s) build a browser Supabase client of their own,\n` +
        `  so their reads inherit no barrier and no error capture — from inside node_modules, where no\n` +
        `  source scan in this repo would ever see them:\n` +
        f.roguePackages.map((name) => `    ${name}`).join("\n") +
        `\n  Only ${PACKAGE_ALLOWED_TO_BUILD_A_CLIENT} may, because utils/supabase/authCookie.ts binds the wrapper into it.`,
    );
  }
  if (f.namelessDoors.length > 0) {
    problems.push(
      `${f.namelessDoors.length} anonymous-by-design door(s) opt out of the wait without saying which\n` +
        `  caller with no account reaches them: ${f.namelessDoors.join(", ")}.\n` +
        `  Copy the purpose from platform.client_callable_door.anonymous_purpose.`,
    );
  }

  if (problems.length === 0) {
    console.log(
      "check-session-first-reads: OK — the barrier is wired into the one client wrapper, " +
        "no module or package routes around it, no host tells a package who the user is, " +
        "and every anonymous door is declared by name.",
    );
    return 0;
  }
  console.error("check-session-first-reads: DD-237 is reopening.\n");
  for (const problem of problems) console.error(`- ${problem}\n`);
  return 1;
}

try {
  exitAfterDrain(main());
} catch (error) {
  console.error("check-session-first-reads: unexpected error", error);
  exitAfterDrain(2);
}
