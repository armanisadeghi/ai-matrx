"use client";

/**
 * "Getting you paid" — the creator payouts (Stripe Connect) setup checklist.
 *
 * Replaces the hand-rolled status block in `CreatorPayoutsPanel`, which had
 * exactly four states — not configured / not connected / charges enabled /
 * anything else — and one button under each. Its failure case said "Finish your
 * Stripe onboarding to start receiving payouts", which is true of a creator
 * missing a bank account, a creator missing a photo of their passport, and a
 * creator whose account Stripe has declined outright. Three completely different
 * situations, one sentence, no way to tell which one you were in.
 *
 * This flow is the best possible fit for `lib/guided-setup/` because Stripe
 * hands us a machine-readable checklist for free: `charges_enabled`,
 * `payouts_enabled` and `requirements.currently_due`. Every one of those is
 * something we can CHECK, so — per Arman's ruling — not one of them is a thing
 * we ask a human to self-report. There is no `confirmed` step here at all, and
 * there must never be one: Stripe is the authority on every line of it.
 *
 *   the connected account   → AUTO. `ensureConnectAccount` is idempotent, so
 *       this is genuinely ours to do. `autoRun: false` on purpose — see below.
 *   each outstanding item   → VERIFIED, one step EACH, named after the actual
 *       thing Stripe asked for. A single "finish onboarding" step is the dead
 *       end this replaces.
 *   can take payments       → VERIFIED off `charges_enabled`.
 *   payouts switched on     → VERIFIED off `payouts_enabled`, with Stripe's own
 *       `disabled_reason` as the sentence when it is off.
 *
 * WHY THE STEP LIST IS A FACTORY. Stripe's requirement codes are an open list —
 * we cannot know at build time whether this creator will be asked for a photo
 * ID, a bank account, or a business URL. A fixed array can only name codes
 * somebody thought of, and anything else would have no row at all. See
 * `ChecklistStepsFactory` in lib/guided-setup/types.ts.
 *
 * WHY `autoRun: false` ON THE ACCOUNT STEP. Creating the account is free and
 * idempotent, but it is a real, KYC-able entity created at a third party in the
 * creator's name, and this panel renders for every creator who opens their
 * dashboard — including the ones who will never sell anything. types.ts reserves
 * the escape hatch for an action that "is not safely repeatable"; the honest
 * reading here is that the account is safely repeatable but not safely
 * UNASKED-FOR. So it keeps the one deliberate click it has always had, with the
 * revenue split shown next to it, and everything after it is automatic.
 *
 * WHY THE FIXES ARE `run`, NOT `href`. Stripe's onboarding link is minted by
 * `accountLinks.create`, is single-use and expires in minutes. A URL baked into
 * an `href` at render time is a link that has usually gone stale by the time the
 * user presses it. `fix.run` mints one at the moment of the click and navigates.
 *
 * Every check reads FRESH status through `ctx.refresh()` rather than the status
 * held in React state: a checklist whose "Check again" re-evaluates last
 * fortnight's answer is not a check. The panel dedupes concurrent calls, so one
 * round of checks costs exactly one request to Stripe.
 */

import { registerChecklist } from "@/lib/guided-setup/registry";
import type { CheckResult, ChecklistStep } from "@/lib/guided-setup/types";
import {
  describePayoutsDisabledReason,
  describeStripeRequirement,
  payoutsWaitingOnStripe,
} from "@/lib/stripe/connect-requirements";
import type { ConnectStatus } from "./service";

export interface CreatorPayoutsContext {
  /** The last status we fetched. Drives WHICH steps exist, never their verdict. */
  status: ConnectStatus | null;
  /** Fetch live status from Stripe. Deduped by the panel; publishes to `status`. */
  refresh: () => Promise<ConnectStatus>;
  /** Create the connected account. Idempotent, no redirect. */
  createAccount: () => Promise<void>;
  /** Send the creator into Stripe's hosted form. Navigates away. */
  openStripe: () => Promise<void>;
}

/** A step id is a persistence key, so it is derived from the code, never a position. */
const requirementStepId = (code: string) => `requirement.${code}`;

/** "Stripe wanted this by 3 March" — only when Stripe actually set a date. */
function deadlineDetail(status: ConnectStatus): string | undefined {
  const at = status.requirements?.currentDeadline;
  if (!at) return undefined;
  return `Stripe wants this by ${new Date(at * 1000).toLocaleDateString()}.`;
}

/**
 * "We couldn't ask Stripe" — used wherever the requirement list is null. It is
 * NOT a failure and must never read as one: the creator has done nothing wrong
 * and there is nothing for them to fix.
 */
const couldNotAsk: CheckResult = {
  status: "unknown",
  reason: "We couldn't check with Stripe just now. Try again in a moment.",
};

/** Payouts aren't set up on this environment at all — nothing the user can do. */
const notConfigured: CheckResult = {
  status: "unknown",
  reason: "Paid classes aren't switched on here yet.",
};

export const creatorPayoutsChecklist = registerChecklist<CreatorPayoutsContext>({
  key: "billing.creator_payouts",
  title: "Getting you paid",
  description:
    "Stripe handles the money, and it tells us exactly what it still needs from you. We re-check every time you come back.",
  completeTitle: "You're set up to get paid",
  completeDescription:
    "Stripe is happy with your account and your earnings go straight to your bank. We keep checking.",
  steps: (ctx): ChecklistStep<CreatorPayoutsContext>[] => {
    const steps: ChecklistStep<CreatorPayoutsContext>[] = [
      {
        kind: "auto",
        id: "account",
        title: "Your payouts account is set up",
        description:
          "Stripe holds the bank details and handles the tax paperwork. You keep 80% of every enrolment.",
        autoRun: false,
        runLabel: "Set up my payouts account",
        runningLabel: "Setting up your payouts account…",
        // No `fix` on the failure: an auto step already renders its own run
        // button, and attaching the same action as a fix prints it twice.
        check: async ({ refresh }): Promise<CheckResult> => {
          const status = await refresh();
          if (!status.configured) return notConfigured;
          return status.connected
            ? { status: "pass" }
            : {
                status: "fail",
                reason: "You don't have a payouts account yet.",
              };
        },
        run: async ({ createAccount }) => createAccount(),
      },
    ];

    // ── One step per thing Stripe is actually waiting for ──────────────────
    //
    // `past_due` is a subset of `currently_due`, so this list is complete; the
    // overdue ones just carry a blunter sentence. A code we have never seen
    // still produces a usable step (describeStripeRequirement never returns
    // nothing) — the list is Stripe's to grow, not ours to predict.
    const requirements = ctx.status?.requirements;
    const overdue = new Set(requirements?.pastDue ?? []);
    const outstanding = requirements?.currentlyDue ?? [];
    for (const code of outstanding) {
      const copy = describeStripeRequirement(code);
      steps.push({
        kind: "verified",
        id: requirementStepId(code),
        title: copy.title,
        description: copy.description,
        dependsOn: ["account"],
        check: async ({ refresh, openStripe }): Promise<CheckResult> => {
          const status = await refresh();
          if (!status.requirements) return couldNotAsk;
          if (!status.requirements.currentlyDue.includes(code)) {
            return { status: "pass" };
          }
          return {
            status: "fail",
            reason: overdue.has(code)
              ? "Stripe is holding your money until it gets this."
              : "Stripe needs this before it can pay you.",
            detail: deadlineDetail(status),
            fix: { label: "Add this in Stripe", run: openStripe },
          };
        },
      });
    }

    // ── Things Stripe already has and is checking ──────────────────────────
    //
    // Optional on purpose: there is nothing for the creator to do, so counting
    // these as work outstanding would be false. They render because "I sent my
    // passport, now what?" deserves an answer on the same screen.
    for (const code of requirements?.pendingVerification ?? []) {
      const copy = describeStripeRequirement(code);
      steps.push({
        kind: "verified",
        id: `checking.${code}`,
        title: `${copy.title} — sent`,
        description: "Stripe has this and is checking it. Usually a day or two.",
        optional: true,
        dependsOn: ["account"],
        check: async ({ refresh }): Promise<CheckResult> => {
          const status = await refresh();
          if (!status.requirements) return couldNotAsk;
          return status.requirements.pendingVerification.includes(code)
            ? {
                status: "unknown",
                reason: "Stripe is still looking at this. There's nothing to do.",
              }
            : { status: "pass" };
        },
      });
    }

    // The two verdict steps wait on every outstanding requirement above them.
    // Without that, a creator missing their ID sees THREE rows each offering
    // "Open my Stripe details" — the same click, described three ways. Blocked
    // rows say what they are waiting for and render no button at all.
    const afterRequirements = ["account", ...outstanding.map(requirementStepId)];

    steps.push(
      {
        kind: "verified",
        id: "charges_enabled",
        title: "You can take payments for your classes",
        description:
          "Until Stripe switches this on, the enrol button can't take anyone's money.",
        dependsOn: afterRequirements,
        check: async ({ refresh, openStripe }): Promise<CheckResult> => {
          const status = await refresh();
          if (!status.configured) return notConfigured;
          if (!status.connected) {
            return { status: "fail", reason: "You don't have a payouts account yet." };
          }
          if (status.chargesEnabled) return { status: "pass" };
          return {
            status: "fail",
            reason: status.detailsSubmitted
              ? "Stripe has your details and hasn't switched this on yet."
              : "Stripe still needs some details from you first.",
            fix: { label: "Open my Stripe details", run: openStripe },
          };
        },
      },
      {
        kind: "verified",
        id: "payouts_enabled",
        title: "Payouts are switched on",
        description: "This is the one that puts money in your bank account.",
        dependsOn: afterRequirements,
        check: async ({ refresh, openStripe }): Promise<CheckResult> => {
          const status = await refresh();
          if (!status.configured) return notConfigured;
          if (!status.connected) {
            return { status: "fail", reason: "You don't have a payouts account yet." };
          }
          if (status.payoutsEnabled) return { status: "pass" };

          const reasonCode = status.requirements?.disabledReason ?? null;
          const reason = describePayoutsDisabledReason(reasonCode);
          // Stripe reviewing is not the creator failing at something, and
          // offering "finish your details" mid-review sends them to a form
          // with nothing left in it.
          if (payoutsWaitingOnStripe(reasonCode)) {
            return { status: "unknown", reason };
          }
          return {
            status: "fail",
            reason,
            fix: { label: "Open my Stripe details", run: openStripe },
          };
        },
      },
    );

    return steps;
  },
});
