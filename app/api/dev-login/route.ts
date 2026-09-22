import { NextResponse, type NextRequest } from "next/server";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  describeFailure,
  formatAttempts,
  isRateLimited,
  isTransportFailure,
  retryTransport,
  tracingFetch,
  type TransportAttempt,
} from "./authTransport";

/**
 * THE NONCE HANDSHAKE — the ONLY way into this route.
 *
 * There is no durable credential in this file and no `?token=` path. A dev
 * login proves identity by WRITING A FILE into this checkout, which anything
 * with shell access can do and no hostile web page can:
 *
 *   1. shell:   pnpm dev-login [/next/path]   (mints .dev-login-nonce.<host>,
 *                                              gitignored, and prints the URL)
 *   2. browser: open the printed URL — it is on YOUR session's hostname
 *   3. route:   compares, DELETES that host's file, signs in.
 *
 * Single-use by construction — the file is consumed on first presentation
 * (match or mismatch), so the nonce that unavoidably appears in the
 * navigation URL is already worthless by the time anything logs it. The
 * dev-only and localhost-only guards sit in front of it, and the drive-by
 * CSRF protection the old token provided is preserved because a hostile page
 * cannot write files into the repo.
 *
 * WHY THE TOKEN PATH IS GONE. `?token=<DEV_LOGIN_TOKEN>` authenticated from a
 * durable env-var credential presented in a URL, so every single use wrote
 * that credential into browser history, dev-server logs and — once agents
 * started driving the browser — the agent's own transcript. It leaked exactly
 * that way on 2026-08-31 and was rotated; the nonce handshake was built in
 * response but the token door was left standing beside it, and on 2026-09-11
 * a second agent leaked the rotated value the same way. Removing the path
 * rather than disabling it is deliberate: the route no longer reads
 * DEV_LOGIN_TOKEN at all, so any exposed value is inert and there is nothing
 * left to rotate. A request still presenting `?token=` gets a 401 that says
 * why and hands over the two-step replacement — see below. The guard for all
 * of this is `route.test.ts`.
 */
// Runtime-only, single-file root. Excluding this dynamic cwd segment prevents
// Turbopack from conservatively tracing the whole checkout into the route.
const REPO_ROOT = /* turbopackIgnore: true */ process.cwd();

/**
 * A NONCE BELONGS TO A HOST (W56c, 2026-09-12).
 *
 * There used to be ONE `.dev-login-nonce` for the whole checkout. Five agent
 * sessions drive this machine at once, and the file is consumed on ANY
 * presentation (see below) — so one agent's mistyped or stale navigation
 * deleted the nonce another agent had just minted, and that agent's sign-in
 * then failed for a reason nothing on its screen could explain.
 *
 * Each hostname now has its own file, which is the same boundary the cookie
 * jar uses: a session driving `s3f1eb9c52.localhost` mints and burns
 * `.dev-login-nonce.s3f1eb9c52.localhost` and cannot reach anyone else's.
 * `scripts/agent-harness/preview-session.sh` mints the matching name; the
 * two are pinned together by `pnpm check:preview-session`.
 */
function nonceFileFor(hostname: string): string {
  // `hostname` comes out of `new URL(...)`, so it is already a parsed host —
  // but this value becomes a PATH, so it is re-validated rather than trusted.
  const safe = /^[a-z0-9.-]{1,253}$/.test(hostname) && !hostname.includes("..")
    ? hostname
    : "invalid-host";
  return join(REPO_ROOT, `.dev-login-nonce.${safe}`);
}

function consumeNonce(presented: string, hostname: string): boolean {
  const file = nonceFileFor(hostname);
  let expected: string;
  try {
    expected = readFileSync(file, "utf8").trim();
  } catch {
    return false; // no handshake file for THIS host — nothing to consume
  }
  // Consume on ANY presentation: a wrong guess must burn the nonce too,
  // otherwise it can be brute-forced against a long-lived file.
  try {
    rmSync(file);
  } catch {
    /* already gone */
  }
  return expected.length >= 16 && presented === expected;
}

/**
 * Dev-only magic login for local AI agents.
 *
 * Usage:
 *   shell:   pnpm dev-login /tasks
 *   browser: open the URL it prints
 *
 * Behavior:
 *   - Hard-refuses unless NODE_ENV !== 'production' AND the host is a loopback
 *     host: localhost, ANY `*.localhost` label (each agent session gets its own,
 *     which is what gives it its own cookie jar), 127.0.0.1, 0.0.0.0 or ::1.
 *   - Requires ?nonce= to match the single-use .dev-login-nonce.<host> file for
 *     the host it was called on, consumed on any presentation. `?token=` is
 *     refused — see the header.
 *   - Redirects to the SAME host it was called on. It must never rewrite the
 *     host to `localhost`: that would drop the caller back into the shared
 *     cookie jar the per-session hostname exists to escape.
 *   - If the AI_ADMIN_USERNAME session already exists, just 302s to `next` (no re-login).
 *   - If SOMEBODY ELSE is signed in, signs them out and signs the admin in — see below.
 *   - Otherwise signs in with AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD and 302s to `next`.
 *   - `next` must be a relative path starting with "/". Defaults to "/dashboard".
 *
 * 🚨 THIS ROUTE MUST END WITH THE ADMIN SIGNED IN, OR IT IS A TRAP.
 *
 * It used to 302 on ANY existing session. Agents share one browser profile, so a
 * probe persona left over from an earlier session (`zzz.*@example.invalid`, a plain
 * member of the fixture orgs) survived the "log in as admin" step in silence — and
 * the next walk read that persona's perfectly correct member-level render as an
 * authorization DEFECT and reported an owner rendering as "Member". A dev-login that
 * can leave you as somebody else is worse than no dev-login: it makes every
 * screenshot taken after it untrustworthy, and nothing on the page says why.
 *
 * Callers should still assert who they are — with `/api/whoami`, NEVER by
 * decoding `/api/session-token`. This line used to say the latter, and that is
 * how a live admin JWT reached an agent transcript on 2026-09-17: the correct
 * habit had only a credential-shaped door to knock on. `/api/whoami` returns
 * the user id and email and nothing else. The route no longer requires that
 * vigilance to be correct either way.
 */
/**
 * WHICH ACCOUNTS THIS DOOR MAY SIGN IN, and why it is a closed list.
 *
 * The route used to be hardcoded to `AI_ADMIN_USERNAME`. A non-admin walk —
 * "does a plain member see what a plain member should see" — therefore had no
 * door at all, and the designated non-admin test account `test@test.com` has no
 * password anywhere on this machine or in any env file (checked 2026-09-21).
 *
 * 🚨 THIS IS A CLOSED LIST, NOT A PARAMETER. `?as=` selects FROM it and can
 * never introduce an address: a dev door that signs in whoever you name is an
 * impersonation primitive, and the fact that it is localhost-only and dev-only
 * is not a reason to build one. Every entry must be an account that exists
 * SOLELY to be tested with — never a real person, and never `TEST_USER_EMAIL`,
 * which on this machine is Arman's own personal account.
 *
 * `test@test.com` is signed in through the service-role magic-link path this
 * route already carries as its password fallback. No password is created, read,
 * or entered for it — there is none to create.
 */
const DEV_LOGIN_ACCOUNTS: readonly string[] = [
  (process.env.AI_ADMIN_USERNAME ?? "").trim().toLowerCase(),
  "test@test.com",
].filter(Boolean);

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Disabled in production" },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  // The nonce file is PER HOST, and under `next dev` the framework rebuilds
  // `request.url` against its bind address — `s3f1eb9c52.localhost` came out
  // as `localhost`, so every per-session URL `pnpm dev-login` printed 401'd
  // against `.dev-login-nonce.localhost` (2026-09-12, in-app browser AND
  // Playwright). The `Host` header is the caller's own host (the same rule
  // the redirect below already applies) and decides which nonce file we read.
  const hostHeader = request.headers.get("host");
  const hostname = hostHeader
    ? new URL(`${url.protocol}//${hostHeader}`).hostname
    : url.hostname;
  // `*.localhost` is loopback by definition (RFC 6761) and is how each agent
  // session gets its own cookie jar on the ONE shared dev server. Accepting it
  // widens nothing: the label still resolves to 127.0.0.1 and the route is
  // already dead in production.
  const isLocal =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1";
  if (!isLocal) {
    return NextResponse.json({ error: "Localhost only" }, { status: 403 });
  }

  // The removed token path must not fail as a mystery: anyone (or any agent
  // following a stale instruction) arriving at the old door is told why it is
  // gone and handed the new one, in full.
  if (url.searchParams.has("token")) {
    return NextResponse.json(
      {
        error:
          "The ?token= path was REMOVED. Authenticating from DEV_LOGIN_TOKEN meant " +
          "putting a durable credential in a URL, which leaks it into browser history, " +
          "dev-server logs and agent transcripts — it leaked that way twice. This route " +
          "no longer reads DEV_LOGIN_TOKEN at all. Use the single-use nonce handshake " +
          "instead: run `pnpm dev-login /wherever` in a shell in this checkout and open " +
          "the URL it prints. The nonce file is per host and is consumed on first use, " +
          "so the nonce in that URL is already worthless once it is logged.",
      },
      { status: 401 },
    );
  }

  const nonce = url.searchParams.get("nonce");
  if (!nonce || !consumeNonce(nonce, hostname)) {
    return NextResponse.json(
      {
        error:
          `Expired, missing, or mismatched nonce for host '${hostname}'. Nonces are ` +
          `PER HOST now (the file is .dev-login-nonce.${hostname}), so that one ` +
          "agent's failed navigation can no longer burn another's. Run `pnpm dev-login` " +
          "in a shell in this checkout — it mints the nonce for YOUR session's hostname " +
          "and prints the URL to open. Each nonce is good for exactly one request; a " +
          "wrong guess burns the file too. If you wrote `.dev-login-nonce` by hand, that " +
          "is the old shared file and no host reads it any more.",
      },
      { status: 401 },
    );
  }

  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const safeNext =
    nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard";
  // 🚨 THE REDIRECT STAYS ON THE HOST IT WAS CALLED ON.
  // The whole point of `<session>.localhost` is a private cookie jar; a redirect
  // that rewrote the host to `localhost` would land the caller back in the
  // SHARED jar carrying a session cookie set for a host it is no longer on —
  // i.e. a sign-in that silently did nothing, plus the eviction of whichever
  // agent owned localhost. The `Host` header is the caller's own host and wins
  // over anything the framework reconstructed.
  const callerHost = request.headers.get("host") ?? url.host;
  const destination = new URL(safeNext, `${url.protocol}//${callerHost}`);

  const supabase = await createClient();

  const defaultEmail = process.env.AI_ADMIN_USERNAME;
  if (!defaultEmail) {
    return NextResponse.json(
      { error: "AI_ADMIN_USERNAME not configured" },
      { status: 500 },
    );
  }
  // `?as=` picks FROM the closed list above. Anything else is refused by name,
  // with the list, so a lane that guessed learns the rule instead of a mystery.
  const requested = (url.searchParams.get("as") ?? defaultEmail).trim().toLowerCase();
  if (!DEV_LOGIN_ACCOUNTS.includes(requested)) {
    return NextResponse.json(
      {
        error:
          `dev-login will not sign in '${requested}'. This door signs in DESIGNATED TEST ` +
          "ACCOUNTS only, from a closed list in the route — it is not an impersonation " +
          `primitive. Allowed: ${DEV_LOGIN_ACCOUNTS.join(", ")}.`,
      },
      { status: 403 },
    );
  }
  const email = requested;
  // Only the admin account has a password on this machine; the other designated
  // accounts have none and go straight to the service-role magic link.
  const password =
    email === (defaultEmail ?? "").trim().toLowerCase()
      ? process.env.AI_ADMIN_PASSWORD
      : undefined;

  const {
    data: { user },
  } = await getClaimsUser(supabase);

  if (user) {
    const same =
      (user.email ?? "").trim().toLowerCase() === email.trim().toLowerCase();
    if (same) return NextResponse.redirect(destination);
    // Somebody else is holding this browser profile. Evict them — this route's
    // whole contract is "you are now the admin", and honoring an unrelated session
    // is how an agent walks a surface as the wrong person without noticing.
    console.warn(
      `[dev-login] evicting a stale session for ${user.email ?? user.id} — signing in as ${email}`,
    );
    await supabase.auth.signOut({ scope: "local" });
  }

  // 🚨 A DROPPED SOCKET IS NOT A BAD PASSWORD (2026-09-21, lane DEV-LOGIN).
  // This route lives in a dev server that runs for hours and keeps a warm
  // connection pool to the auth host; a shell `curl` opens a fresh socket
  // every time. That is the whole difference between "the auth host answers a
  // normal 401 in 110 ms from a terminal" and this route answering
  // `OTP fallback failed: fetch failed` — the failure was never the account,
  // it was one pooled request that did not complete, unretried, and then
  // reported as the NEXT call's problem. Every auth call below is now retried
  // when and only when the failure is transport, and everything that happened
  // is carried in `attempts` so the reason a lane reads is the real one.
  // Full WHY: ./authTransport.ts.
  const attempts: TransportAttempt[] = [];
  let error: unknown = null;
  if (password) {
    ({ error } = await retryTransport(
      "signInWithPassword",
      () => supabase.auth.signInWithPassword({ email, password }),
      attempts,
    ));
    if (!error) {
      if (attempts.length) {
        console.warn(
          `[dev-login] signed in after a transport retry — ${formatAttempts(attempts)}`,
        );
      }
      return NextResponse.redirect(destination);
    }
  }

  // The auth host never answered. Saying "your password is stale" here — and
  // then running a fallback that goes to the SAME host over the SAME pool —
  // is how this route spent a day telling lanes their product was broken.
  if (isTransportFailure(error)) {
    console.error(
      `[dev-login] could not reach the auth host for ${email} — ${formatAttempts(attempts)}`,
    );
    return NextResponse.json(
      {
        error:
          "dev-login could not REACH the auth host — this is a transport failure, " +
          "not a bad credential and not a product defect. The call was retried " +
          `${attempts.length} time(s) and each attempt is below. Re-running the ` +
          "handshake usually succeeds; if every attempt names the same cause, the " +
          "network or the auth host is genuinely down. Nothing about the admin " +
          "account or your walk is implicated.",
        attempts: attempts.map((a) => `${a.label} #${a.attempt} (${a.ms}ms): ${a.reason}`),
        retryable: true,
      },
      { status: 503, headers: { "Retry-After": "2" } },
    );
  }

  // 🚨 A DRIFTED PASSWORD MUST NOT TAKE AGENT TESTING OFFLINE (2026-08-30).
  // AI_ADMIN_PASSWORD is a copy of a secret that lives in Supabase, so the two
  // drift the moment the account's password is changed anywhere else — and on
  // 2026-08-30 they had, which returned a bare {"error":"Invalid login
  // credentials"} here and blocked EVERY agent from opening any authenticated
  // surface. The route's contract is "this handshake makes you the admin", and the
  // service role can satisfy that contract without the password: mint a
  // single-use OTP for the same account and redeem it. Same account, same
  // session cookie, same eviction rules — only the proof-of-identity differs,
  // and it is still gated by the single-use nonce handshake plus the dev-only
  // guard above.
  // 🚨 A VOLUME LIMIT IS NOT A BAD PASSWORD EITHER (2026-09-21, measured).
  // Three lanes' worth of parallel headless sign-ins push Supabase auth into
  // `over_request_rate_limit`. The auth host answered, so this is not
  // transport; it never judged the password, so it is not a drift. Running the
  // OTP fallback here spends a SECOND request from the same exhausted bucket,
  // makes the limit worse for every other lane, and can only fail — which is
  // exactly how the fallback's message ended up standing in for the cause.
  if (isRateLimited(error)) {
    console.warn(
      `[dev-login] the auth host is rate-limiting this machine — ${formatAttempts(attempts)}`,
    );
    return NextResponse.json(
      {
        error:
          "The auth host is RATE-LIMITING this machine — too many sign-ins from " +
          "here in too short a window, which is what happens when several lanes " +
          "drive headless walks at once. Nothing is wrong with the admin account, " +
          "the password, or your walk. Wait a few seconds and run the handshake " +
          "again. The OTP fallback was deliberately NOT tried: it would spend " +
          "another request from the same exhausted budget and make this worse for " +
          "every other lane.",
        attempts: attempts.map((a) => `${a.label} #${a.attempt} (${a.ms}ms): ${a.reason}`),
        retryable: true,
      },
      { status: 429, headers: { "Retry-After": "10" } },
    );
  }

  // Past this line the auth host DID answer and the answer was no — a real
  // credential drift, which is the only case the OTP fallback was built for.
  const credentialReason = password
    ? describeFailure(error as Parameters<typeof describeFailure>[0])
    : "no password is configured for this designated test account — the magic link " +
      "is its only door, and that is deliberate";
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      {
        error: `Password sign-in was REFUSED by the auth host (${credentialReason}) and no SUPABASE_SECRET_KEY is set for the OTP fallback.`,
      },
      { status: 401 },
    );
  }
  console.warn(
    password
      ? `[dev-login] AI_ADMIN_PASSWORD is stale for ${email} (${credentialReason}); ` +
        "falling back to a service-role OTP. Refresh the env value when convenient."
      : `[dev-login] signing ${email} in through the service-role magic link (${credentialReason}).`,
  );
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    serviceKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      // The ONE frame that can still see WHY a fetch died: auth-js keeps the
      // message and drops the `cause`, so "fetch failed" arrives naked unless
      // we look first. See ./authTransport.ts.
      global: { fetch: tracingFetch("generateLink", attempts) },
    },
  );
  const link = await retryTransport(
    "generateLink",
    () => service.auth.admin.generateLink({ type: "magiclink", email }),
    attempts,
  );
  const otp = (link.data as { properties?: { email_otp?: string } } | undefined)
    ?.properties?.email_otp;
  if (link.error || !otp) {
    const transport = isTransportFailure(link.error);
    const limited = !transport && isRateLimited(link.error);
    return NextResponse.json(
      {
        error:
          (transport
            ? "dev-login could not REACH the auth host on the OTP fallback either — " +
              "this is a transport failure, not a product defect. "
            : limited
              ? "The auth host is RATE-LIMITING this machine on the OTP fallback — " +
                "too many sign-ins from here in too short a window. Wait and run " +
                "the handshake again; nothing is wrong with your walk. "
              : "The OTP fallback was refused by the auth host. ") +
          `The password sign-in before it said: ${credentialReason}.`,
        attempts: attempts.map((a) => `${a.label} #${a.attempt} (${a.ms}ms): ${a.reason}`),
        retryable: transport || limited,
      },
      transport
        ? { status: 503, headers: { "Retry-After": "2" } }
        : limited
          ? { status: 429, headers: { "Retry-After": "10" } }
          : { status: 401 },
    );
  }
  const verified = await retryTransport(
    "verifyOtp",
    () => supabase.auth.verifyOtp({ email, token: otp, type: "email" }),
    attempts,
  );
  if (verified.error) {
    const transport = isTransportFailure(verified.error);
    return NextResponse.json(
      {
        error: `${transport ? "Transport failure while redeeming the OTP" : "The auth host refused the OTP"}: ${describeFailure(verified.error)}`,
        attempts: attempts.map((a) => `${a.label} #${a.attempt} (${a.ms}ms): ${a.reason}`),
        retryable: transport,
      },
      transport
        ? { status: 503, headers: { "Retry-After": "2" } }
        : { status: 401 },
    );
  }
  console.warn(`[dev-login] signed in via the OTP fallback — ${formatAttempts(attempts)}`);
  return NextResponse.redirect(destination);
}
