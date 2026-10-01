// features/admin/users/lib/personSegments.ts
//
// THE answer to "who is this account, and how far did they get?" for every
// admin roster. Two independent axes, each a single ordered value:
//
//   kind  — person | team | test | bot     (is this a human we acquired?)
//   stage — guest → guest_used_ai → signed_up → signed_in → used_ai → active
//
// Measured on the main database 2026-09-30: of 979 anonymous accounts created
// in 30 days, 670 came from HeadlessChrome and 59 more from local previews,
// agent browsers and probes; 41 ever ran AI. Of 406 permanent accounts, 258
// never confirmed their email. The roster printed all of them as identical
// "New / No organizations" rows, so the ~20 people who actually used the
// product were invisible. This module is the decision tree that separates them.
//
// Pure and deterministic: the route derives it on every read from facts that
// are already stored (auth.users, users.guest_executions, the usage rollup).
// Nothing here guesses from a UUID-looking name.

import { classifyAcquisitionTraffic } from "@/lib/product-analytics/user-acquisition";

export const PERSON_KINDS = ["person", "team", "test", "bot"] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const PERSON_KIND_LABEL: Record<PersonKind, string> = {
  person: "Person",
  team: "Team",
  test: "Test",
  bot: "Bot",
};

export const PERSON_STAGES = [
  "guest",
  "guest_used_ai",
  "signed_up",
  "signed_in",
  "used_ai",
  "active",
] as const;
export type PersonStage = (typeof PERSON_STAGES)[number];

export const PERSON_STAGE_LABEL: Record<PersonStage, string> = {
  guest: "Guest",
  guest_used_ai: "Guest · used AI",
  signed_up: "Signed up",
  signed_in: "Signed in",
  used_ai: "Used AI",
  active: "Active this week",
};

/** Ordinal for sorting: further along the journey sorts higher. */
export const PERSON_STAGE_RANK: Record<PersonStage, number> = {
  guest: 0,
  guest_used_ai: 1,
  signed_up: 2,
  signed_in: 3,
  used_ai: 4,
  active: 5,
};

/**
 * Accounts we create ourselves. `.invalid`, `.test`, `.example` and
 * `.localhost` are reserved by RFC 2606/6761 and can never belong to a
 * customer; the two named addresses are the platform's test accounts.
 */
const TEST_EMAIL =
  /(^admin@admin\.com$|^test@test\.com$|\.(invalid|test|example|localhost)$|@example\.(com|org|net)$)/i;

/**
 * Clients that are ours, not a visitor's: the extension's incident probe, the
 * guest-org proof script, and the HappyDOM test runtime.
 */
const INTERNAL_CLIENT = /(MatrxExtend\w*Probe|guest-org-proof|HappyDOM)/i;

/**
 * Gmail ignores dots, so signup bots spray dotted variants of one mailbox
 * (`l.o.xu.m.a.w.50.3@gmail.com`). Measured 2026-09-30: 91 Gmail accounts with
 * three or more dots, none ever confirmed or signed in; 0 of 71 with fewer.
 * Judged only while unconfirmed — a person who confirms is never called a bot.
 */
const DOTTED_GMAIL = /^[^@]*\.[^@]*\.[^@]*\.[^@]*@(gmail|googlemail)\.com$/i;

/**
 * An AI agent driving a real browser (the Claude desktop app's browser pane).
 * The user agent says Chrome, so the generic bot pattern does not see it.
 */
const AGENT_BROWSER = /\bClaude\/[\d.]+/;

export interface PersonSignals {
  email: string | null;
  isAnonymous: boolean;
  adminLevel: string | null;
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  /** First observed browser for this identity (users.guest_executions). */
  userAgent: string | null;
  landingHost: string | null;
  referrer: string | null;
  referrerState: string | null;
  /** All-time AI requests (chat.admin_user_usage_rollup). */
  aiRequests: number;
  /** AI requests in the last 7 days. */
  aiRequests7d: number;
}

export interface PersonSegment {
  kind: PersonKind;
  /** Why `kind` was chosen, as a short tooltip phrase. */
  kindReason: string;
  stage: PersonStage;
}

export function classifyPerson(signals: PersonSignals): PersonSegment {
  return {
    ...classifyKind(signals),
    stage: classifyStage(signals),
  };
}

function classifyKind(
  signals: PersonSignals,
): Pick<PersonSegment, "kind" | "kindReason"> {
  if (signals.email && TEST_EMAIL.test(signals.email))
    return { kind: "test", kindReason: "Test email address" };
  // Before the browser checks: our own people first open the app on a local
  // preview, and that does not make them a test account.
  if (signals.adminLevel)
    return { kind: "team", kindReason: "Platform admin" };
  const traffic = classifyAcquisitionTraffic(
    signals.userAgent,
    signals.referrer,
    signals.landingHost,
  );
  if (traffic === "local_test" || signals.referrerState === "local_test")
    return { kind: "test", kindReason: "First seen on a local preview" };
  if (signals.userAgent && INTERNAL_CLIENT.test(signals.userAgent))
    return { kind: "test", kindReason: "Platform test client" };
  if (traffic === "bot")
    return { kind: "bot", kindReason: "Automated user agent" };
  if (
    signals.email &&
    !signals.emailConfirmed &&
    !signals.lastSignInAt &&
    DOTTED_GMAIL.test(signals.email)
  )
    return { kind: "bot", kindReason: "Dotted-Gmail signup, never confirmed" };
  if (signals.userAgent && AGENT_BROWSER.test(signals.userAgent))
    return { kind: "bot", kindReason: "AI agent browser" };
  return {
    kind: "person",
    kindReason: signals.userAgent
      ? "Ordinary browser"
      : "No automation signal",
  };
}

function classifyStage(signals: PersonSignals): PersonStage {
  if (signals.isAnonymous)
    return signals.aiRequests > 0 ? "guest_used_ai" : "guest";
  if (signals.aiRequests7d > 0) return "active";
  if (signals.aiRequests > 0) return "used_ai";
  if (signals.lastSignInAt) return "signed_in";
  return "signed_up";
}
