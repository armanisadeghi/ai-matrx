"use client";

/**
 * "The right to send" — the sending-identity setup checklist.
 *
 * EXTRACTED 2026-08-14 from `SendingIdentityDetailPage`, which had hand-rolled
 * the same shape as three hard-coded "Gate" cards in gate order (domain →
 * authentication → warm-up). Those cards were good — the copy and the
 * refusal→fix mapping below are all theirs, kept verbatim — but they were a
 * second checklist system, with no persistence, no progress, and no way to
 * record the one thing only the customer can tell us.
 *
 * Mapped onto `lib/guided-setup/` by what we can actually DO, per outreach-
 * system.md §5.3b:
 *
 *   publish the DNS record  → CONFIRMED. We generate the exact value; we cannot
 *       log into their registrar. A hand-typed TXT record is how a
 *       non-technical expert gets a silent typo, so it ships with Copy buttons.
 *   domain ownership        → AUTO. The verification is ours to run.
 *   SPF / DKIM / DMARC      → VERIFIED, one step EACH. A single "authentication"
 *       step that fails tells the user nothing they can act on; three steps
 *       each name the thing that is missing.
 *   warm-up                 → AUTO, but `autoRun: false` ON PURPOSE. Starting
 *       warm-up begins sending real mail from the customer's real domain. It is
 *       the one action here we can perform and deliberately will not perform
 *       unasked (types.ts: "Set false only when the action costs real money or
 *       is not safely repeatable").
 *
 * The server is the sole authority on every verdict — nothing here re-derives a
 * status from parts. `identity.spf_pass` is tri-state on purpose: `null` means
 * NOT CHECKED YET, which the primitive renders as its neutral `unknown`, never
 * as a failure (a resolver timeout must never read as "your SPF is broken").
 */

import type { ReactNode } from "react";

import { registerChecklist } from "@/lib/guided-setup/registry";
import type { CheckResult } from "@/lib/guided-setup/types";
import type { SendingIdentityDetail } from "./types";

export interface SendingIdentityContext {
  identity: SendingIdentityDetail;
  checkDomain: () => Promise<void>;
  checkAuthentication: () => Promise<void>;
  startWarmup: () => Promise<void>;
  /** Rendered inside the "publish the record" step — the existing DNS card. */
  dnsCard: ReactNode;
  /** Rendered inside the warm-up step — the existing ramp bar. */
  warmupPanel: ReactNode;
}

/** Turn one tri-state authentication flag into a step result. */
function authResult(
  pass: boolean | null | undefined,
  domain: string,
  missing: string,
  recheck: () => Promise<void>,
): CheckResult {
  if (pass === true) return { status: "pass" };
  if (pass === false) {
    return {
      status: "fail",
      reason: missing,
      fix: { label: "Check again now", run: recheck },
    };
  }
  return {
    status: "unknown",
    reason: `We haven't read ${domain}'s DNS for this yet.`,
    fix: { label: "Check it now", run: recheck },
  };
}

export const sendingIdentityChecklist = registerChecklist<SendingIdentityContext>({
  key: "outreach.sending_identity",
  title: "Before this mailbox can run a campaign",
  description:
    "We re-check all of this every time you come back — a DNS record someone deletes next month shows up here as a problem.",
  completeTitle: "This mailbox is ready to send",
  completeDescription:
    "Domain proven, authentication passing, warm-up finished. We keep checking.",
  steps: [
    {
      kind: "confirmed",
      id: "publish_dns",
      title: "Add our record to your domain",
      // The plain-English "what this is" sentence lives on the DnsRecordCard
      // below (the canonical component) — repeating it here put the same
      // explanation on screen twice (caught in live render, 2026-08-17).
      description:
        "You add it once, wherever you bought your domain — everything to copy is below.",
      confirmLabel: "I've added it",
      // NO `values()` here on purpose — see the note on `extra` below.
      howTo: ({ identity }) => [
        `Sign in wherever you bought ${identity.sending_domain}.`,
        "Find the DNS settings (sometimes called DNS records, or Advanced DNS).",
        "Add a new record using the values below — copy each one, don't retype it.",
        "Save it, then come back here. Changes can take up to an hour to show up.",
      ],
      /**
       * THE CANONICAL COMPONENT LAW. `DnsRecordSpec` already HAS a component —
       * `DnsRecordCard` — so the record renders through it and through nothing
       * else. This step originally also declared `values()`, which put a
       * second, hand-built copy of the same five fields directly above the
       * card. Live render, 2026-08-14: the two copies disagreed. The card is
       * right (`record.name` is the short host you usually type;
       * `record.host` is the FQDN some providers want instead) and the
       * hand-built copy had them SWAPPED — which for a non-technical expert
       * means pasting the wrong string into their registrar and watching the
       * check fail forever with no idea why. The duplicate is gone.
       */
      extra: ({ dnsCard }) => dnsCard,
    },
    {
      kind: "auto",
      id: "domain_verified",
      title: "We've proved the domain is yours",
      description:
        "Until this passes, nothing can be sent from this mailbox. There is no way to skip it.",
      autoRun: false,
      runLabel: "Check the domain now",
      runningLabel: "Looking up your DNS…",
      // No `fix` on the failure: an auto step already renders its own
      // `runLabel` button, and attaching the same action as a fix printed
      // "Check the domain now" twice side by side (caught in live render).
      check: async ({ identity }): Promise<CheckResult> =>
        identity.domain_verified
          ? {
              status: "pass",
              detail: identity.domain_checked_at
                ? `Last checked ${new Date(identity.domain_checked_at).toLocaleString()}`
                : undefined,
            }
          : {
              status: "fail",
              reason: identity.domain_checked_at
                ? "We looked, and our record isn't on your domain yet. If you just added it, give it up to an hour."
                : "We haven't checked your domain yet.",
            },
      run: async ({ checkDomain }) => checkDomain(),
    },
    {
      kind: "verified",
      id: "spf",
      title: "SPF is passing",
      description:
        "Says this mail provider is allowed to send for your domain.",
      dependsOn: ["domain_verified"],
      check: async ({ identity, checkAuthentication }) =>
        authResult(
          identity.spf_pass,
          identity.sending_domain,
          "Your domain doesn't list this mail provider as allowed to send for it.",
          checkAuthentication,
        ),
    },
    {
      kind: "verified",
      id: "dkim",
      title: "DKIM is passing",
      description: "Signs each message so it cannot be forged or altered.",
      dependsOn: ["domain_verified"],
      check: async ({ identity, checkAuthentication }) =>
        authResult(
          identity.dkim_pass,
          identity.sending_domain,
          "Your messages aren't being signed, so receiving servers can't prove they're really from you.",
          checkAuthentication,
        ),
    },
    {
      kind: "verified",
      id: "dmarc",
      title: "DMARC is passing",
      description:
        "Tells receiving servers what to do with mail that fails the first two. Gmail and Outlook throw away bulk mail from domains without all three.",
      dependsOn: ["domain_verified"],
      check: async ({ identity, checkAuthentication }) =>
        authResult(
          identity.dmarc_pass,
          identity.sending_domain,
          "Your domain doesn't tell receiving servers what to do with mail that fails its checks.",
          checkAuthentication,
        ),
    },
    {
      kind: "auto",
      id: "warmup",
      title: "Warmed up",
      description:
        "A brand-new mailbox that sends at full volume gets its domain blocked within days. It sends a little more each day until it has a reputation.",
      dependsOn: ["domain_verified", "spf", "dkim", "dmarc"],
      // Deliberately NOT self-running: this starts sending real mail from the
      // customer's real domain. It is the human's call to begin.
      autoRun: false,
      runLabel: "Start warming up",
      runningLabel: "Starting warm-up…",
      check: async ({ identity }): Promise<CheckResult> => {
        const warmup = identity.warmup;
        if (!warmup) {
          return {
            status: "fail",
            reason: "Warm-up hasn't started yet.",
          };
        }
        if (warmup.completed_at) {
          return { status: "pass", detail: "Warm-up finished." };
        }
        // Genuinely in progress and nothing to fix — `unknown` is the honest
        // state here (it is not done, and it is not the user's to act on).
        return {
          status: "unknown",
          reason: `Day ${warmup.day} of ${warmup.total_days}. Today's limit is ${warmup.daily_allowance} messages. Only time finishes this.`,
        };
      },
      run: async ({ startWarmup }) => startWarmup(),
      extra: ({ warmupPanel }) => warmupPanel,
    },
  ],
});
