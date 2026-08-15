// features/crm/sending-identities/types.ts
//
// Types for the sending-identity surface, DERIVED from the generated aidream
// contract so a backend rename is a compile error here rather than a blank
// screen in production. Never hand-copy a shape from the Python models.
//
// Server contract + THE LAW this surface renders:
//   aidream/aidream/services/sending_identity/FEATURE.md
//   docs/handoffs/outreach-system.md §5

import type { components } from "@/types/python-generated/api-types";

export type SendingIdentityView =
  components["schemas"]["SendingIdentityView"];
export type SendingIdentityDetail =
  components["schemas"]["SendingIdentityDetail"];
export type SendingRefusal = components["schemas"]["SendingRefusal"];
export type ConnectableMailbox = components["schemas"]["ConnectableMailbox"];
export type CheckRecord = components["schemas"]["CheckRecord"];
export type CheckReport = components["schemas"]["CheckReport"];
export type SendingEventRecord = components["schemas"]["SendingEventRecord"];
export type SendingPolicyView = components["schemas"]["SendingPolicyView"];
export type IdentityHealth = components["schemas"]["IdentityHealth"];
export type WarmupProgress = components["schemas"]["WarmupProgress"];
export type DnsRecordSpec = components["schemas"]["DnsRecordSpec"];

export type IdentityStatus = SendingIdentityView["status"];
export type FixAction = SendingRefusal["fix_action"];

/**
 * How each status reads to a person who does not know what SPF is.
 *
 * `ready` is the ONLY state a campaign may use, and the copy says so — a user
 * who thinks "verifying" is good enough will spend a week wondering why their
 * campaign will not start.
 */
export const STATUS_COPY: Record<
  IdentityStatus,
  { label: string; help: string; tone: "neutral" | "progress" | "good" | "bad" }
> = {
  draft: {
    label: "Not set up",
    help: "This mailbox cannot send anything yet.",
    tone: "neutral",
  },
  verifying: {
    label: "Checking your domain",
    help: "You own the domain. Now its email authentication has to pass.",
    tone: "progress",
  },
  warming: {
    label: "Warming up",
    help: "Building a sending reputation. Campaigns can start when this finishes.",
    tone: "progress",
  },
  ready: {
    label: "Ready to send",
    help: "Verified, authenticated and warmed up.",
    tone: "good",
  },
  paused: {
    label: "Paused",
    help: "Nothing will be sent from this mailbox until someone resumes it.",
    tone: "bad",
  },
  disabled: {
    label: "Removed",
    help: "This mailbox is no longer used for outreach.",
    tone: "neutral",
  },
};

/**
 * THE DOOR LAW, applied to a refusal: every problem the system can detect ships
 * with its one-click fix. This map turns the server's machine-readable
 * `fix_action` into the button a person presses.
 *
 * `kind` decides what the surface renders:
 *   action — a button that calls the server right now
 *   link   — navigate somewhere that resolves it
 *   guide  — the fix is on-screen already (the DNS record card)
 *   wait   — only time resolves it; show a countdown, never an error
 */
export type FixKind = "action" | "link" | "guide" | "wait";

export const FIX_COPY: Record<
  FixAction,
  { label: string; kind: FixKind; href?: string }
> = {
  connect_mailbox: { label: "Connect a mailbox", kind: "link", href: "/settings/integrations" },
  reconnect_mailbox: { label: "Reconnect Google", kind: "link", href: "/settings/integrations" },
  publish_dns_record: { label: "Show me the record to publish", kind: "guide" },
  check_domain: { label: "Check the domain now", kind: "action" },
  check_authentication: { label: "Check authentication now", kind: "action" },
  start_warmup: { label: "Start warming up", kind: "action" },
  wait_for_warmup: { label: "Warming up", kind: "wait" },
  wait_for_pacing: { label: "Waiting between messages", kind: "wait" },
  wait_for_quiet_hours: { label: "Outside their working hours", kind: "wait" },
  review_and_resume: { label: "Review and resume", kind: "action" },
  enable_org_outreach: { label: "Turn outreach back on", kind: "action" },
  verify_recipient_address: { label: "Verify the address", kind: "link", href: "/crm" },
  choose_another_identity: { label: "Use another mailbox", kind: "link", href: "/crm/sending-identities" },
  none: { label: "", kind: "wait" },
};

/** Events that count as a problem when they show up in the audit trail. */
export const NEGATIVE_EVENTS = new Set(["bounced", "complained", "failed", "unsubscribed"]);
