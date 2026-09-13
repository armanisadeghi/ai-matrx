import { NextResponse, type NextRequest } from "next/server";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@/utils/supabase/server";

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
 * Callers should still assert who they are (decode `/api/session-token`) — but the
 * route no longer requires that vigilance to be correct.
 */
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

  const email = process.env.AI_ADMIN_USERNAME;
  const password = process.env.AI_ADMIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json(
      { error: "AI_ADMIN_USERNAME / AI_ADMIN_PASSWORD not configured" },
      { status: 500 },
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    await supabase.auth.signOut();
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (!error) return NextResponse.redirect(destination);

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
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      {
        error: `Password sign-in failed (${error.message}) and no SUPABASE_SECRET_KEY is set for the OTP fallback.`,
      },
      { status: 401 },
    );
  }
  console.warn(
    `[dev-login] AI_ADMIN_PASSWORD is stale for ${email} (${error.message}); ` +
      "falling back to a service-role OTP. Refresh the env value when convenient.",
  );
  const { createClient: createServiceClient } = await import("@supabase/supabase-js");
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const link = await service.auth.admin.generateLink({ type: "magiclink", email });
  const otp = link.data?.properties?.email_otp;
  if (link.error || !otp) {
    return NextResponse.json(
      { error: `OTP fallback failed: ${link.error?.message ?? "no otp returned"}` },
      { status: 401 },
    );
  }
  const verified = await supabase.auth.verifyOtp({ email, token: otp, type: "email" });
  if (verified.error) {
    return NextResponse.json({ error: verified.error.message }, { status: 401 });
  }
  return NextResponse.redirect(destination);
}
