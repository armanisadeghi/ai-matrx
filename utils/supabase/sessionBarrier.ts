/**
 * sessionBarrier.ts — NO AUTHENTICATED READ LEAVES THIS CLIENT BEFORE THE
 * SESSION IS ATTACHED (DD-237).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS CLOSES (measured on production, 2026-09-14)
 * ──────────────────────────────────────────────────────────────────────────
 * `supabase-js` attaches the caller's JWT per request, inside its own fetch:
 *
 *     fetchWithAuth → const realToken = await getAccessToken()
 *                     headers.Authorization = `Bearer ${realToken ?? apiKey}`
 *
 * When `auth.getSession()` yields nothing — the session has not attached yet,
 * or a long-lived tab's refresh failed — that `?? apiKey` silently sends the
 * PUBLISHABLE key instead. PostgREST then runs the statement as `anon`, and
 * `anon` holds NO grant on any application table in this database (verified
 * 2026-09-14: `information_schema.role_table_grants` returns zero rows for
 * grantee `anon` outside the Supabase-owned schemas). So the read comes back
 *
 *     42501  permission denied for table <x>     HTTP 401
 *
 * which is a GRANT refusal, not an RLS filter and not an empty list. Nothing
 * in the client retried it and nothing told the reader. `ops.system_error`,
 * `source_app='matrx-frontend'`, 48 h to 2026-09-14 15:30Z:
 *
 *     70 rows `error_type='42501'`, 31 distinct relations
 *     59 of them HTTP 401  ← this class: the request went out as `anon`
 *      9 of them HTTP 403  ← a real grant gap for `authenticated`, NOT this
 *     28 distinct relations in the 401 group — every one of them a table or
 *        function with no `anon` grant, i.e. a signed-in-only door
 *
 * The 401 group has two sub-populations, and this barrier answers both:
 *
 *   PRE-ATTACH   the page is young (13 rows under 10 s, 16 more under 60 s)
 *                and the read raced the session.
 *   LAPSED       the tab is old (33 rows over 10 min; the `user_preferences`
 *                batch at 08:13:53Z was seven background tabs open 2.3–14.5 h)
 *                and the session went away underneath it while reads kept
 *                firing.
 *
 * Both are the same thing from the client's side: a read that needs a session
 * left without one, and the failure was silent. DD-215b (the Shape sandbox
 * rendering the platform's component instead of the organization's) is one
 * downstream symptom of it; `features/content-ir` owns its own retry and
 * subscribes to the signal below.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES — and deliberately does NOT do
 * ──────────────────────────────────────────────────────────────────────────
 * DOES, on the one shared browser client, so no hook has to remember:
 *
 *   1. WAIT. When a session is EXPECTED (the auth cookie is in the document)
 *      but auth has not delivered one yet, the request waits for the first
 *      auth report — bounded by SESSION_ATTACH_BUDGET_MS — before it is sent.
 *      When the session is already attached (the overwhelming majority) the
 *      request is sent synchronously, byte-identically to before.
 *   2. RETRY ONCE. A refusal that means "this request carried no identity"
 *      (401 with 42501 / PGRST301 / 28000) is retried exactly once after the
 *      session re-resolves — `getSession()` first, then a bounded wait on the
 *      next auth-state change. Retrying is safe for writes too: a 42501 is
 *      raised before the statement does anything, and PostgREST runs each
 *      request in its own transaction, so a refused write wrote nothing.
 *   3. SCREAM. A barrier that fires announces itself in the Error Inspector
 *      with the remedy, and `sessionStateNow()` stamps every Supabase capture
 *      so a refusal that survives the retry says WHY in `ops.system_error`
 *      (`context.session_state`) instead of arriving as a bare 42501.
 *
 * DOES NOT:
 *
 *   - Refuse a read on its own authority. The database is the authorization
 *     layer (docs/official/db-rules.md §6: never add a new security layer on
 *     your own authority). With no session and no cookie the request still
 *     goes, and the DB's answer stands — honest, and loud.
 *   - Block the shell. The wait is bounded, it only ever delays a network
 *     request that was already async, and it never gates rendering: skeletons
 *     stay exactly where they were (the `ssr-zero-layout-shift` rule).
 *   - Widen access. The anonymous-by-design list (anonymousByDesignDoors.ts)
 *     only removes a WAIT. It can never grant anything.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHERE IT IS INSTALLED
 * ──────────────────────────────────────────────────────────────────────────
 * `lib/diagnostics/supabaseErrorCapture.ts` — the ONE proxy the browser client
 * is wrapped in (bound in `utils/supabase/authCookie.ts`). Every `.from()`,
 * `.rpc()` and `.schema().from()/.rpc()` in browser code goes through it, so
 * the barrier is inherited by every call site with zero per-feature changes.
 * `pnpm check:session-first-reads` keeps it that way.
 */

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { isAnonymousByDesign } from "@/utils/supabase/anonymousByDesignDoors";

/** How long a request may wait for the first auth report before going anyway. */
export const SESSION_ATTACH_BUDGET_MS = 3_000;
/** How long a refused request may wait for a session before it gives up. */
export const SESSION_RECOVERY_BUDGET_MS = 5_000;
/**
 * After one wait expires, how long every other request skips the wait. A tab
 * holding an auth cookie it can no longer redeem must not pay the full attach
 * budget on every single read for the rest of its life.
 */
export const WAIT_COOLDOWN_MS = 30_000;

/**
 * What the client knows about its own session right now.
 *
 * `expected` is the one that matters: the auth cookie says a session belongs
 * to this browser, and auth has not (yet, or any longer) produced one.
 */
export type SessionState =
  /** Auth has not reported and there is no cookie to read (SSR, or pre-boot). */
  | "unknown"
  /** Auth reported a session. The normal state. */
  | "attached"
  /** The auth cookie is present but no session is in hand — racing or lapsed. */
  | "expected"
  /** No cookie, no session: this browser is signed out. */
  | "absent";

/** The marker written into `ops.system_error.context.session_state`. */
export type SessionStateMarker =
  | "attached"
  | "pre_attach"
  | "signed_out"
  | "unknown";

interface AuthLike {
  getSession(): Promise<{
    data: { session: { access_token?: string } | null };
    error: unknown;
  }>;
  onAuthStateChange(
    callback: (event: string, session: unknown) => void,
  ): unknown;
}

interface ClientLike {
  auth?: unknown;
}

// ── Module state (one browser client per tab, so module scope is the tab) ──

let boundAuth: AuthLike | null = null;
let storageKey: string | null = null;
/** `null` = auth has not reported yet. Tri-state on purpose. */
let sessionPresent: boolean | null = null;
/** Epoch ms until which the pre-send wait is skipped — see WAIT_COOLDOWN_MS. */
let waitSuppressedUntil = 0;
const waiting = new Set<() => void>();

function isAuthLike(value: unknown): value is AuthLike {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { getSession?: unknown; onAuthStateChange?: unknown };
  return (
    typeof candidate.getSession === "function" &&
    typeof candidate.onAuthStateChange === "function"
  );
}

/**
 * `@supabase/ssr` sets `auth.storageKey` to the auth cookie's name, so the
 * client tells us what to look for and this module needs no import from
 * `authCookie.ts` — which imports the wrapper that imports this file.
 */
function readStorageKey(auth: unknown): string | null {
  if (!auth || typeof auth !== "object" || !("storageKey" in auth)) return null;
  const key = (auth as { storageKey?: unknown }).storageKey;
  return typeof key === "string" && key.length > 0 ? key : null;
}

function drain(): void {
  if (waiting.size === 0) return;
  const pending = [...waiting];
  waiting.clear();
  for (const listener of pending) {
    try {
      listener();
    } catch {
      /* one bad listener must never stop the others */
    }
  }
}

/**
 * Bind the barrier to the browser client. Idempotent, browser-only, and called
 * once from the client wrapper at construction — the earliest point at which
 * `INITIAL_SESSION` can be heard, which is what makes the wait nearly free.
 */
export function installSessionBarrier(client: unknown): void {
  if (typeof window === "undefined") return;
  if (boundAuth) return;
  if (!client || typeof client !== "object") return;
  const auth = (client as ClientLike).auth;
  if (!isAuthLike(auth)) return;
  boundAuth = auth;
  storageKey = readStorageKey(auth);
  try {
    // INITIAL_SESSION fires as soon as the client has read its storage, with
    // whatever it found — so a session that attached before this call still
    // reaches us, and "no session" is reported just as promptly.
    auth.onAuthStateChange((_event, session) => {
      markSession(Boolean(session));
    });
  } catch {
    // No listener, no signal: `sessionPresent` stays null, every request keeps
    // today's behaviour, and the retry path still works off `getSession()`.
    boundAuth = auth;
  }
}

/** Test seam — forget the binding and every waiter. */
export function resetSessionBarrierForTests(): void {
  waiting.clear();
  boundAuth = null;
  storageKey = null;
  sessionPresent = null;
  waitSuppressedUntil = 0;
}

/** Record what auth just told us, and release anyone waiting on a session. */
function markSession(present: boolean | null): void {
  const had = sessionPresent;
  sessionPresent = present;
  if (present === true && had !== true) drain();
}

/** Test seam — drive the signal without a Supabase client. */
export function announceSessionForTests(present: boolean | null): void {
  markSession(present);
}

// ── Reading the world ──────────────────────────────────────────────────────

/**
 * Is an auth cookie present for this browser? `@supabase/ssr` chunks a large
 * cookie as `<key>.0`, `<key>.1`, … so any chunk counts.
 *
 * Returns `null` when the question cannot be answered (no document, or the
 * client never told us its storage key) — never `false`, because "I cannot
 * tell" and "this browser is signed out" must not collapse into one answer.
 */
export function authCookiePresent(): boolean | null {
  if (typeof document === "undefined") return null;
  if (!storageKey) return null;
  const cookie = document.cookie;
  if (!cookie) return false;
  for (const pair of cookie.split(";")) {
    const name = pair.slice(0, pair.indexOf("=")).trim() || pair.trim();
    if (name === storageKey) return true;
    if (name.startsWith(`${storageKey}.`)) {
      const chunk = name.slice(storageKey.length + 1);
      if (/^(0|[1-9][0-9]*)$/.test(chunk)) return true;
    }
  }
  return false;
}

/** What the client knows about its session right now. */
export function sessionStateNow(): SessionState {
  if (sessionPresent === true) return "attached";
  const cookie = authCookiePresent();
  if (cookie === true) return "expected";
  if (cookie === false && sessionPresent === false) return "absent";
  return "unknown";
}

/**
 * The marker stamped onto every Supabase capture, so a refusal in
 * `ops.system_error` says which world it happened in instead of arriving as a
 * bare 42501 that costs the next lane a day. Sampled at capture time, which is
 * the same tick the response resolved on.
 */
export function sessionStateMarker(): SessionStateMarker {
  switch (sessionStateNow()) {
    case "attached":
      return "attached";
    case "expected":
      return "pre_attach";
    case "absent":
      return "signed_out";
    default:
      return "unknown";
  }
}

// ── The signal other modules subscribe to ──────────────────────────────────

/** True once auth has told us a session exists. Never "signed out" — see above. */
export function hasAttachedSession(): boolean {
  return sessionPresent === true;
}

/**
 * Run `listener` once, as soon as a session exists — immediately when auth has
 * already said so. Returns an unsubscribe for the not-yet case.
 *
 * This is the platform signal DD-237 promised: `features/content-ir`'s
 * registry retry and anything else that has to re-ask after a refusal points
 * here rather than opening its own auth subscription.
 */
export function whenSessionAttached(listener: () => void): () => void {
  if (sessionPresent === true) {
    try {
      listener();
    } catch {
      /* never throw into a caller's catch block */
    }
    return () => {};
  }
  waiting.add(listener);
  return () => {
    waiting.delete(listener);
  };
}

function waitForAttach(budgetMs: number): Promise<boolean> {
  if (sessionPresent === true) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (attached: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(attached);
    };
    const unsubscribe = whenSessionAttached(() => done(true));
    const timer = setTimeout(() => done(false), budgetMs);
  });
}

// ── The two seams the client wrapper calls ─────────────────────────────────

/** What the wrapper knows about the call it is about to make. */
export interface BarrierCallContext {
  schema?: string;
  relation?: string;
}

function doorName(ctx: BarrierCallContext): string {
  return ctx.relation ? `${ctx.schema ?? "public"}.${ctx.relation}` : "(unknown)";
}

/**
 * SEAM 1 — may this request be sent right now, with no await at all?
 *
 * Yes whenever the session is attached, whenever the door is declared
 * anonymous-by-design, and whenever waiting could not help (no cookie, or
 * nothing to read). Keeping this synchronous is what makes the barrier free on
 * the path every healthy request takes.
 */
export function canSendImmediately(ctx: BarrierCallContext): boolean {
  if (typeof window === "undefined") return true;
  if (sessionPresent === true) return true;
  if (isAnonymousByDesign(ctx.schema, ctx.relation)) return true;
  if (Date.now() < waitSuppressedUntil) return true;
  return authCookiePresent() !== true;
}

/**
 * Ask auth directly. This is the half that covers boot: `getSession()` awaits
 * `auth-js`'s own `initializePromise`, so a client that is still reading its
 * storage answers when it is ready rather than reporting "no session". It is
 * also what triggers `auth-js`'s single-flighted refresh for an expired access
 * token. Returns true when a usable token exists.
 */
async function probeSession(): Promise<boolean> {
  if (!boundAuth) return false;
  try {
    const { data, error } = await boundAuth.getSession();
    const token = Boolean(data?.session?.access_token) && !error;
    if (token) markSession(true);
    return token;
  } catch {
    return false;
  }
}

/**
 * SEAM 1 (slow path) — wait for the session this browser is known to have.
 *
 * Probe first, then listen: a refresh landing in this tab, or a sign-in in
 * another one (the auth cookie is domain-wide), arrives as an auth event that
 * `getSession()` alone would never wait for.
 *
 * Bounded twice over. The per-request wait is capped, because a client that
 * hangs on a slow session is a worse defect than the one being fixed; and a
 * wait that expires suppresses the next ones for WAIT_COOLDOWN_MS, so a tab
 * holding a stale cookie it can no longer redeem does not pay the full budget
 * on every read for the rest of its life. Expiring is not itself a failure and
 * says nothing: the request simply goes, and if the database refuses it the
 * second seam is what announces why.
 */
export async function awaitSessionBeforeSend(
  _ctx: BarrierCallContext,
): Promise<void> {
  if (await probeSession()) return;
  if (await waitForAttach(SESSION_ATTACH_BUDGET_MS)) return;
  waitSuppressedUntil = Date.now() + WAIT_COOLDOWN_MS;
}

interface RefusalLike {
  error?: { code?: string; message?: string } | null;
  status?: number;
}

/**
 * Is this result the database saying "your request carried no identity"?
 *
 * The discriminator is HTTP 401. A 42501 at 403 is a REAL grant gap for
 * `authenticated` (9 such rows in the 48 h census — `credential_items`,
 * `integration_connections`, `container_resource_counts`) and must never be
 * retried or explained away as a session problem.
 */
export function isSessionRefusal(result: RefusalLike): boolean {
  const code = result.error?.code;
  if (!code) return false;
  if (result.status !== 401) return false;
  return code === "42501" || code === "PGRST301" || code === "28000";
}

/** Should a refusal on this door be retried once? */
export function shouldRecoverSession(ctx: BarrierCallContext): boolean {
  if (typeof window === "undefined") return false;
  if (isAnonymousByDesign(ctx.schema, ctx.relation)) return false;
  // A browser with no auth cookie is simply signed out. Retrying would be a
  // lie dressed as resilience; the DB's refusal is the honest answer.
  return authCookiePresent() === true;
}

/**
 * SEAM 2 — a refused request asks for its session back, once.
 *
 * `getSession()` first, because that is what triggers `auth-js`'s own
 * single-flighted refresh when the access token has expired; then a bounded
 * wait for the next auth-state change, which is how a sign-in in another tab
 * (the cookie is domain-wide) reaches this one.
 *
 * Returns true when a token exists and the caller should retry.
 */
export async function recoverSessionForRetry(
  ctx: BarrierCallContext,
): Promise<boolean> {
  // The refusal is proof that auth's last word is stale, whatever it was: this
  // request DID reach the database and the database saw no identity. Say so
  // before asking again, so `sessionStateMarker()` reports `pre_attach` rather
  // than the `attached` a long-lived tab has been claiming for hours.
  if (sessionPresent === true) markSession(false);
  let recovered = await probeSession();
  // The same cooldown the pre-send wait obeys, for the same reason: once one
  // wait has expired, this tab is holding a cookie it cannot redeem, and every
  // later refusal must fail fast rather than add the full recovery budget to
  // each of a page's reads.
  if (!recovered && Date.now() >= waitSuppressedUntil) {
    recovered = await waitForAttach(SESSION_RECOVERY_BUDGET_MS);
    if (!recovered) waitSuppressedUntil = Date.now() + WAIT_COOLDOWN_MS;
  }
  announceBarrierFired(ctx, recovered);
  return recovered;
}

/**
 * A recovery layer that fires without saying so is the defect it was built to
 * fix. Both outcomes are announced; only the failure is durable, because a
 * repaired read is news for the Error Inspector, not for the repair queue.
 */
function announceBarrierFired(
  ctx: BarrierCallContext,
  recovered: boolean,
): void {
  const door = doorName(ctx);
  if (recovered) {
    console.warn(
      `[sessionBarrier] ${door} was refused because the request carried no ` +
        `session (42501/401). The session re-resolved and the request is being ` +
        `retried once. This firing means a real session-availability bug got ` +
        `past the proactive wait — it is not routine.`,
    );
    captureError({
      source: "supabase-postgrest",
      operation: "unknown",
      schema: ctx.schema,
      relation: ctx.relation,
      code: "SESSION_BARRIER_RECOVERED",
      message:
        `${door} was refused for having no session, the session re-resolved, ` +
        `and the read was retried once and served. Nothing was lost; the race ` +
        `that caused it is DD-237.`,
      status: 401,
      sessionState: "attached",
      // Recovered, announced, and visible in the inspector — not a server-side
      // repair job. The failure below is.
      durable: false,
    });
    return;
  }
  captureError({
    source: "supabase-postgrest",
    operation: "unknown",
    schema: ctx.schema,
    relation: ctx.relation,
    code: "SESSION_BARRIER_UNRECOVERED",
    message:
      `${door} was refused for having no session and the session did not come ` +
      `back within ${SESSION_RECOVERY_BUDGET_MS} ms. The auth cookie is still ` +
      `in this browser, so the session is lapsed rather than absent — sign in ` +
      `again to repair it. The read was NOT retried and its data is missing.`,
    status: 401,
    sessionState: sessionStateMarker(),
    durable: true,
  });
}
