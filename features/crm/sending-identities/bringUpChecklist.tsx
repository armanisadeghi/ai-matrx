"use client";

/**
 * "Get outreach live" — the ORG-LEVEL production bring-up checklist.
 *
 * The per-mailbox checklist (`outreach.sending_identity`) answers "may THIS
 * mailbox send?". This one answers the question above it: "what still stands
 * between this organization and its first real outreach message?" — the five
 * human gates the outreach program's status board tracks, as one guided flow:
 *
 *   1. a named person's mailbox, connected, with its domain proven (TXT);
 *   2. the Google Cloud reply pipe (Pub/Sub topic + subscription) — CONFIRMED,
 *      with exact copy-paste values, because we cannot log into their Google
 *      Cloud console;
 *   3. the server actually listening for replies — VERIFIED against the live
 *      deployment config (booleans from the server, never values);
 *   4. the sending rules accepted — VERIFIED against crm.outreach_acceptance
 *      (until someone accepts, every send is refused as `aup_not_accepted`);
 *   5. the contact-finding vendor keys in the vault — VERIFIED (presence only);
 *   6. permission to read replies (gmail.readonly) — VERIFIED and OPTIONAL,
 *      because it is queued behind Google's review of our app and no user
 *      action can hurry it; the step exists so its state is visible, not to
 *      block the "done" verdict on something nobody here can act on.
 *
 * Machine-check everything checkable; copy-paste values for the rest — per
 * lib/guided-setup/FEATURE.md. Data reads follow each fact's canonical path:
 * identities and readiness through the sending-identities REST service (server
 * work), AUP acceptance direct from Supabase (plain data).
 */

import { registerChecklist } from "@/lib/guided-setup/registry";
import type { CheckResult } from "@/lib/guided-setup/types";
import { hasAcceptedOutreachPolicy } from "@/features/crm/compliance/service";
import type { BringUpReadiness, SendingIdentityView } from "./types";

export interface BringUpContext {
  organizationId: string;
  /** Cached single-flight fetchers — four steps must not mean four HTTP calls. */
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
            reason: `${first.from_address} is connected, but you haven't proven you own ${first.sending_domain} yet.`,
            fix: {
              label: "Finish that mailbox's setup",
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
      kind: "confirmed",
      id: "reply_pipe",
      title: "Give Google a delivery pipe for replies",
      description:
        "Google delivers replies by pushing them to us. That pipe (a Pub/Sub topic and push subscription in your Google Cloud project) is created once, in Google's console — we can't do it from here, so here is everything to paste.",
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
              reason: "Nobody in this organization has accepted the sending rules yet.",
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
        "Finding and verifying addresses uses two outside services. Without the verifier in particular, a newly found address can never be sent to at all.",
      check: (ctx) =>
        readinessOrUnknown(ctx, (readiness) => {
          const missing: string[] = [];
          if (!readiness.hunter_key_present) {
            missing.push(
              "Hunter (finds addresses — API access is included on Free; Starter is $49 monthly or $408 yearly, hunter.io)",
            );
          }
          if (!readiness.millionverifier_key_present) {
            missing.push(
              "MillionVerifier (confirms an address works — a business signup includes free trial credits; the one-time trial pack is $4.90, millionverifier.com)",
            );
          }
          if (missing.length > 0) {
            return {
              status: "fail",
              reason: `Not connected yet: ${missing.join("; ")}.`,
              detail:
                "After signing up, save each service's API key in the vault as HUNTER_API_KEY and MILLIONVERIFIER_API_KEY.",
              fix: { label: "Open the key vault", href: "/settings/secrets" },
            };
          }
          return { status: "pass" };
        }),
    },
    {
      kind: "verified",
      id: "reply_permission",
      title: "Permission to read replies",
      description:
        "Google grants this permission to the platform, not to you — it is queued behind Google's current review of our app, and nothing on your side can speed it up. It is shown here so you can see where it stands.",
      optional: true,
      dependsOn: ["named_mailbox"],
      check: (ctx) =>
        readinessOrUnknown(ctx, (readiness) => {
          if (readiness.connected_mailboxes === 0) {
            return {
              status: "unknown",
              reason: "Connect a mailbox first — this permission attaches to it.",
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
