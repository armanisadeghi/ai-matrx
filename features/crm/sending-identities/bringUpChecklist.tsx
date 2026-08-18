"use client";

/**
 * "Get outreach live" — the org-level production bring-up checklists.
 *
 * SPLIT BY AUDIENCE (Arman, 2026-08-17, after the first real bring-up):
 * the original single checklist put Google Cloud Pub/Sub topics, service
 * accounts and server env-var names in front of a normal organization.
 * Verbatim reaction: "Why the fuck would you have server settings and who may
 * publish service accounts?" Those steps are AI MATRX OPERATOR work — they
 * configure OUR deployment, once, for every org — and a normal org must see
 * zero DevOps vocabulary anywhere on this page.
 *
 * So there are now TWO registered checklists sharing one context:
 *
 *   `outreach.production_bring_up` — THE CUSTOMER's steps. Rendered for every
 *       org: a named mailbox on a proven domain, the sending rules, and the
 *       two contact-finding services. The vendor keys ARE a customer step
 *       because `bring-up-readiness` checks them in the personal→org secrets
 *       vault (`_secret_present(user_id, org_id, key)`) — they are per-org
 *       facts the org itself supplies, not platform config.
 *
 *   `outreach.platform_bring_up` — THE OPERATOR's steps. Rendered ONLY for
 *       super-admins, under an explicit "Platform setup" section: the Google
 *       Cloud reply pipe (Pub/Sub topic + push subscription + the two server
 *       settings), the server actually listening, and the gmail.readonly
 *       grant (queued behind Google's review of OUR OAuth app — platform
 *       work, nothing any org can act on). These read deployment env config
 *       (`GMAIL_INBOUND_PUBSUB_TOPIC` / `OUTREACH_INBOUND_PUSH_TOKEN`), the
 *       same for every org on the server.
 *
 * Machine-check everything checkable; copy-paste values for the rest — per
 * lib/guided-setup/FEATURE.md. Data reads follow each fact's canonical path:
 * identities and readiness through the sending-identities REST service (server
 * work), AUP acceptance direct from Supabase (plain data).
 *
 * Persistence note: the reply-pipe confirmation moved from the old combined
 * key to `outreach.platform_bring_up`, so an operator who ticked it before
 * 2026-08-17 re-ticks it once. Customer step ids are unchanged.
 */

import { registerChecklist } from "@/lib/guided-setup/registry";
import type { CheckResult } from "@/lib/guided-setup/types";
import { hasAcceptedOutreachPolicy } from "@/features/crm/compliance/service";
import type { BringUpReadiness, SendingIdentityView } from "./types";

export interface BringUpContext {
  organizationId: string;
  /** Cached single-flight fetchers — several steps must not mean several HTTP calls. */
  identities: () => Promise<SendingIdentityView[]>;
  readiness: () => Promise<BringUpReadiness>;
  /** Drop the readiness cache so the next check asks the server again. */
  refreshReadiness: () => Promise<void>;
  /** Opens the connect-mailbox dialog; resolves when it closes. */
  openConnect: () => Promise<void>;
  /** Opens the sending-rules dialog; resolves when it closes (accepted or not). */
  requestAcceptRules: () => Promise<void>;
}

/** Mirror of the shared-address list the send authority refuses (crm_07 §4). */
const ROLE_LOCAL_PARTS = new Set([
  "info", "sales", "hello", "contact", "support", "admin", "noreply",
  "no-reply", "marketing", "team", "office",
]);

function isNamedMailbox(identity: SendingIdentityView): boolean {
  const local = identity.from_address.split("@")[0]?.toLowerCase() ?? "";
  return !ROLE_LOCAL_PARTS.has(local);
}

async function readinessOrUnknown(
  ctx: BringUpContext,
  answer: (readiness: BringUpReadiness) => CheckResult,
): Promise<CheckResult> {
  let readiness: BringUpReadiness;
  try {
    readiness = await ctx.readiness();
  } catch (err) {
    return {
      status: "unknown",
      reason: "We couldn't reach the server to check this just now.",
      detail: err instanceof Error ? err.message : String(err),
      fix: { label: "Check again now", run: ctx.refreshReadiness },
    };
  }
  return answer(readiness);
}

/** THE CUSTOMER's checklist — what THIS ORGANIZATION does to go live. */
export const bringUpChecklist = registerChecklist<BringUpContext>({
  key: "outreach.production_bring_up",
  title: "Get outreach live",
  description:
    "The one-time setup between here and your first real message. We re-check everything each time you come back.",
  completeTitle: "Outreach is ready to go live",
  completeDescription:
    "Every gate is open. Campaigns will still pace themselves and stop the moment someone replies.",
  steps: [
    {
      kind: "verified",
      id: "named_mailbox",
      title: "A real person's mailbox is connected, on a proven domain",
      description:
        "Outreach must come from a named person — shared addresses like info@ are refused at send time.",
      check: async (ctx): Promise<CheckResult> => {
        const identities = await ctx.identities();
        if (identities.length === 0) {
          return {
            status: "fail",
            reason: "No mailbox is connected yet.",
            fix: { label: "Connect a mailbox", run: ctx.openConnect },
          };
        }
        const named = identities.filter(isNamedMailbox);
        if (named.length === 0) {
          return {
            status: "fail",
            reason:
              "Only shared addresses (like info@) are connected. Sending is refused from those — connect a mailbox that belongs to a person.",
            detail: identities.map((i) => i.from_address).join(", "),
            fix: { label: "Connect a named mailbox", run: ctx.openConnect },
          };
        }
        const proven = named.find((i) => i.domain_verified);
        if (!proven) {
          const first = named[0];
          return {
            status: "fail",
            reason: `${first.from_address} is connected. One step left: show that ${first.sending_domain} is yours — the mailbox page has the exact record to copy and where to paste it.`,
            fix: {
              label: "Finish setting it up",
              href: `/crm/sending-identities/${first.id}`,
            },
          };
        }
        return {
          status: "pass",
          detail: `${proven.from_address} on ${proven.sending_domain}`,
        };
      },
    },
    {
      kind: "verified",
      id: "sending_rules",
      title: "Someone has accepted the sending rules",
      description:
        "Until a person in this organization agrees to the rules, every send is refused.",
      check: async (ctx): Promise<CheckResult> => {
        let accepted: boolean;
        try {
          accepted = await hasAcceptedOutreachPolicy({
            organizationId: ctx.organizationId,
            lane: "cold_outreach",
          });
        } catch (err) {
          return {
            status: "unknown",
            reason: "We couldn't check the acceptance record just now.",
            detail: err instanceof Error ? err.message : String(err),
          };
        }
        return accepted
          ? { status: "pass" }
          : {
              status: "fail",
              reason: "One step left: read the sending rules and agree to them — it takes a minute.",
              fix: {
                label: "Read and accept the sending rules",
                run: (ctx as BringUpContext).requestAcceptRules,
              },
            };
      },
    },
    {
      kind: "verified",
      id: "vendor_keys",
      title: "The contact-finding services are connected",
      description:
        "Finding and verifying email addresses uses two outside services you sign up for. Each one gives you a key — a long code — that you save here once.",
      check: (ctx) =>
        readinessOrUnknown(ctx, (readiness) => {
          const missing: string[] = [];
          if (!readiness.hunter_key_present) {
            missing.push(
              "Hunter (finds addresses — included on their free plan; hunter.io)",
            );
          }
          if (!readiness.millionverifier_key_present) {
            missing.push(
              "MillionVerifier (confirms an address works before anything is sent to it; millionverifier.com)",
            );
          }
          if (missing.length > 0) {
            return {
              status: "fail",
              reason: `Not connected yet: ${missing.join("; ")}.`,
              detail:
                "Sign up, copy the key each service gives you, and save it on the Keys page — Hunter's under the name HUNTER_API_KEY, MillionVerifier's under MILLIONVERIFIER_API_KEY.",
              fix: { label: "Open the Keys page", href: "/settings/secrets" },
            };
          }
          return { status: "pass" };
        }),
    },
  ],
});

/**
 * THE OPERATOR's checklist — AI Matrx platform setup, once per deployment.
 * Rendered ONLY for super-admins. DevOps vocabulary is allowed and correct
 * here; it must never leak into the customer checklist above.
 */
export const platformBringUpChecklist = registerChecklist<BringUpContext>({
  key: "outreach.platform_bring_up",
  title: "Platform setup — AI Matrx operators",
  description:
    "Deployment-level reply infrastructure, configured once for every organization on this server. Customers never see this section.",
  completeTitle: "Platform reply infrastructure is configured",
  completeDescription:
    "The reply pipe is set up and the server is listening. Nothing here needs a customer.",
  steps: [
    {
      kind: "confirmed",
      id: "reply_pipe",
      title: "Give Google a delivery pipe for replies",
      description:
        "Google delivers replies by pushing them to us. That pipe (a Pub/Sub topic and push subscription in our Google Cloud project) is created once, in Google's console.",
      values: () => [
        {
          label: "Who may publish into the topic",
          value: "gmail-api-push@system.gserviceaccount.com",
          hint: "Grant this Google service account the Pub/Sub Publisher role on the topic.",
        },
        {
          label: "Where the push subscription delivers",
          value: "https://server.app.matrxserver.com/outreach/inbound/gmail/<delivery-secret>",
          hint: "Replace <delivery-secret> with the same secret you set as the server's delivery secret below.",
        },
        {
          label: "Server setting: the topic's full name",
          value: "GMAIL_INBOUND_PUBSUB_TOPIC",
          hint: "Set on every server, with the value projects/<your-project>/topics/<your-topic>.",
        },
        {
          label: "Server setting: the delivery secret",
          value: "OUTREACH_INBOUND_PUSH_TOKEN",
          hint: "Set on every server. A long random value; it also goes into the delivery address above.",
        },
      ],
      howTo: () => [
        "In Google Cloud, open Pub/Sub and create a topic (any name).",
        "On that topic, grant the service account above the Pub/Sub Publisher role.",
        "Create a push subscription on the topic, delivering to the address above.",
        "Set the two server settings on every server, then check the next step.",
      ],
      confirmLabel: "I've created the topic and subscription",
    },
    {
      kind: "verified",
      id: "server_listening",
      title: "The server is listening for replies",
      description:
        "Without this, a campaign refuses to run — sending without being able to hear a reply or an unsubscribe is the one thing this system will not do.",
      dependsOn: ["reply_pipe"],
      check: (ctx) =>
        readinessOrUnknown(ctx, (readiness) => {
          const missing: string[] = [];
          if (!readiness.pubsub_topic_configured) missing.push("the topic's full name");
          if (!readiness.push_token_configured) missing.push("the delivery secret");
          if (missing.length > 0) {
            return {
              status: "fail",
              reason: `The server doesn't have ${missing.join(" or ")} yet. Both settings from the previous step need to be set on every server.`,
              fix: { label: "Check again now", run: ctx.refreshReadiness },
            };
          }
          return { status: "pass" };
        }),
    },
    {
      kind: "verified",
      id: "reply_permission",
      title: "Permission to read replies (gmail.readonly)",
      description:
        "Google grants this to OUR OAuth app — it is queued behind Google's review, and no customer action can hurry it. Shown here so its state is visible.",
      optional: true,
      check: (ctx) =>
        readinessOrUnknown(ctx, (readiness) => {
          if (readiness.connected_mailboxes === 0) {
            return {
              status: "unknown",
              reason: "This org has no connected mailbox yet — the permission attaches to one.",
            };
          }
          if (readiness.gmail_readonly_granted) {
            return { status: "pass", detail: "A connected mailbox can already read replies." };
          }
          return {
            status: "fail",
            reason:
              "Not granted yet. The moment Google approves it, reconnecting the mailbox turns this green — until then, campaigns correctly refuse to run rather than send without listening.",
            fix: { label: "Check again", run: ctx.refreshReadiness },
          };
        }),
    },
  ],
});
