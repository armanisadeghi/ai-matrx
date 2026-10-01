/**
 * No message leaves a copy of production — the frontend server's outbound guard.
 *
 * Why (lane F1/X1 of the Mandate Candidates campaign, 2026-09-30): a process wired to the nightly
 * clone holds production's provider keys (Resend, Twilio, Slack) while the copy holds production's
 * real people. The dev server in clone mode (`pnpm preview:start`) is exactly such a process. The
 * clone's quarantine stops the DATABASE calling out; it cannot stop this server.
 *
 * THE RULE (the same one aidream enforces in `aidream/services/clone_connection/outbound_guard.py`):
 * a server may hand a message to a provider for an arbitrary recipient, or change provider-side
 * state, ONLY when its database is PROVEN production. Anything else — the clone, any branch, a
 * local Supabase, or no URL at all — reaches only a loopback test handset.
 *
 * THE ONE IDENTITY ANSWER: the host of `NEXT_PUBLIC_SUPABASE_URL`, the URL every server-side
 * Supabase client in this repo is built from (`utils/supabase/adminClient.ts`). Production is the
 * custom domain `db.matrxserver.com` or `brsgrqvjdzwihsvnfqkf.supabase.co`; the clone preview's
 * URL is `<clone-ref>.supabase.co` (`scripts/clone-preview/clone-preview-env.cjs`).
 *
 * THE SEAMS: `lib/email/client.ts::sendEmail` (all app email), `app/api/test-email`,
 * `lib/sms/send.ts::sendSms` (every SMS), `lib/sms/verify.ts::sendVerification` (Twilio Verify),
 * `lib/sms/numbers.ts` purchase + webhook repoint (Twilio account writes), and
 * `app/api/slack-proxy` (third-party Slack writes).
 *
 * Nothing fails silently: every refusal is a `console.warn` naming channel and database, and the
 * seam returns its own failure shape carrying `suppressed_on_clone` — never a success.
 */

/** Matrx Main — the only database whose server may reach a real person. */
export const PRODUCTION_REF = "brsgrqvjdzwihsvnfqkf";
export const PRODUCTION_HOSTS: ReadonlySet<string> = new Set([
  "db.matrxserver.com",
  `${PRODUCTION_REF}.supabase.co`,
]);

/**
 * The loopback TEST HANDSETS — Twilio numbers we own whose inbound lands in
 * `communication.test_handset_inbox`, so a text to them reaches a database row, not a person.
 * 🚨 MIRROR of `aidream/aidream/designated_test_recipients.py::LOOPBACK_TEST_HANDSETS`, the single
 * home (numbers are added there, on Arman's word). `outbound-guard.test.ts` fails when the two
 * copies disagree.
 */
export const LOOPBACK_TEST_HANDSETS: ReadonlySet<string> = new Set([
  "+19498072145", // admin@admin.com
  "+19496662578", // test@test.com
]);

export const SUPPRESSED_ON_CLONE = "suppressed_on_clone";

export type OutboundChannel = "email" | "sms" | "voice" | "slack" | "provider_write";

export interface ServerDatabase {
  host: string | null;
  ref: string | null;
  isProduction: boolean;
}

export interface OutboundSuppression {
  code: typeof SUPPRESSED_ON_CLONE;
  channel: OutboundChannel;
  database: ServerDatabase;
  message: string;
}

export class OutboundSuppressedError extends Error {
  readonly code = SUPPRESSED_ON_CLONE;
  constructor(readonly suppression: OutboundSuppression) {
    super(suppression.message);
    this.name = "OutboundSuppressedError";
  }
}

/** Which database this server is wired to, from the one URL its Supabase clients use. */
export function serverDatabase(env: NodeJS.ProcessEnv = process.env): ServerDatabase {
  const raw = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  let host: string | null = null;
  try {
    host = raw ? new URL(raw).host.toLowerCase() : null;
  } catch {
    host = null;
  }
  const ref = host?.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1] ?? (host === "db.matrxserver.com" ? PRODUCTION_REF : null);
  return { host, ref, isProduction: host !== null && PRODUCTION_HOSTS.has(host) };
}

function describe(db: ServerDatabase): string {
  return db.host ? `${db.host}${db.ref ? ` (${db.ref})` : ""}` : "no NEXT_PUBLIC_SUPABASE_URL";
}

/**
 * `null` when this delivery may go to the provider; otherwise the refusal, already logged.
 * Call it immediately before the provider request, with the exact destination.
 */
export function outboundSuppression(
  channel: OutboundChannel,
  address: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): OutboundSuppression | null {
  const database = serverDatabase(env);
  if (database.isProduction) return null;
  if ((channel === "sms" || channel === "voice") && LOOPBACK_TEST_HANDSETS.has((address ?? "").trim())) {
    return null;
  }
  const message =
    `Not sent: this server's database is not production (${describe(database)}; production is ` +
    `${PRODUCTION_REF}). A copy of production holds real people and real provider accounts, so ` +
    `a ${channel} from it reaches only a loopback test handset. Nothing was handed to the provider. ` +
    "Remedy: do this from a production-wired server, or address a loopback test handset.";
  console.warn(`OUTBOUND SUPPRESSED (${SUPPRESSED_ON_CLONE}) channel=${channel} database=${describe(database)}`);
  return { code: SUPPRESSED_ON_CLONE, channel, database, message };
}

/** Throw {@link OutboundSuppressedError} when {@link outboundSuppression} refuses. */
export function refuseOutboundOffProduction(
  channel: OutboundChannel,
  address: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const suppression = outboundSuppression(channel, address, env);
  if (suppression) throw new OutboundSuppressedError(suppression);
}
