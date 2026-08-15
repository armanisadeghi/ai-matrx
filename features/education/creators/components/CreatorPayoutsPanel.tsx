"use client";

// features/education/creators/components/CreatorPayoutsPanel.tsx
//
// The creator EARNINGS surface on the dashboard. Payout SETUP is the declared
// `billing.creator_payouts` checklist on lib/guided-setup/ — it names each thing
// Stripe is actually waiting for instead of the old four-state block, whose
// failure case said "Finish your Stripe onboarding" whether you were missing a
// bank account, a passport photo, or had been declined outright.
//
// What stays here is what is NOT a setup step: the revenue split, and the link
// into the Stripe Express dashboard where Stripe HOSTS balances and payout
// history (we link, we never rebuild it). No control on this surface moves
// money — everything here either reads status or opens a Stripe-hosted page.
//
// The panel owns the ONE fetch. Every checklist step's check calls `refresh()`,
// which dedupes concurrent callers onto a single in-flight request, so a round
// of checks costs exactly one call to Stripe and every step sees the same
// answer.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BadgeDollarSign, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectEffectiveOrganizationId,
  selectPersonalOrganizationId,
} from "@/lib/redux/slices/appContextSlice";
import { GuidedChecklist } from "@/lib/guided-setup/components/GuidedChecklist";
import { SPLIT_LABEL } from "@/lib/stripe/connect";
import {
  creatorPayoutsChecklist,
  type CreatorPayoutsContext,
} from "../payoutsChecklist";
import {
  ensureConnectAccount,
  getConnectStatus,
  openConnectDashboard,
  startConnectOnboarding,
  type ConnectStatus,
} from "../service";

export function CreatorPayoutsPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<Promise<ConnectStatus> | null>(null);

  /**
   * Fetch live status, deduped. Five checks fire at once on every round; they
   * all need the same one request, and they must all see the SAME answer or
   * the rows can disagree with each other on screen.
   */
  const refresh = useCallback((): Promise<ConnectStatus> => {
    const existing = inFlight.current;
    if (existing) return existing;
    const request = getConnectStatus()
      .then((fresh) => {
        setStatus(fresh);
        return fresh;
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    return request;
  }, []);

  // Returned from Stripe's hosted onboarding — say so once. The checklist
  // re-checks on its own; this is only the acknowledgement.
  const connectParam = searchParams.get("connect");
  useEffect(() => {
    if (connectParam !== "return") return;
    toast.success("Thanks — we're checking with Stripe now.");
  }, [connectParam]);

  /**
   * The checklist's one `auto` action. On failure it BOTH toasts and rethrows:
   * the checklist re-checks the moment a run settles, which immediately
   * overwrites the failure message with the (still true) "you don't have a
   * payouts account yet" — so without the toast the creator presses the button
   * and watches nothing happen. This is the live path when Connect is not
   * enabled on the platform account, which answers 409.
   */
  const createAccount = useCallback(async () => {
    try {
      await ensureConnectAccount();
    } catch (cause: unknown) {
      toast.error("We couldn't set up your payouts account", {
        description: cause instanceof Error ? cause.message : undefined,
      });
      throw cause;
    }
    await refresh();
  }, [refresh]);

  /** Send the creator into Stripe's hosted form. Navigates away on success. */
  const openStripe = useCallback(async () => {
    const result = await startConnectOnboarding();
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    toast.error(
      result.connectDisabled
        ? "Payouts aren't switched on yet"
        : "Could not open your Stripe details",
      { description: result.error },
    );
  }, []);

  const checklistContext = useMemo<CreatorPayoutsContext>(
    () => ({ status, refresh, createAccount, openStripe }),
    [status, refresh, createAccount, openStripe],
  );

  /**
   * A creator's payout account is THEIRS, not their current workspace's, so the
   * run is anchored to their personal org — switching the active org must not
   * hand them a different setup state for the same Stripe account.
   */
  const personalOrgId = useAppSelector(selectPersonalOrganizationId);
  const effectiveOrgId = useAppSelector(selectEffectiveOrganizationId);
  const organizationId = personalOrgId ?? effectiveOrgId;

  async function onOpenDashboard() {
    setBusy(true);
    try {
      const r = await openConnectDashboard();
      if (r.url) {
        window.open(r.url, "_blank", "noopener,noreferrer");
        return;
      }
      toast.error("Payout dashboard unavailable", { description: r.error });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <BadgeDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-sm font-semibold text-foreground">Earnings &amp; payouts</h2>
      </div>

      <GuidedChecklist
        definition={creatorPayoutsChecklist}
        context={checklistContext}
        scope={organizationId ? { organizationId } : null}
        completeSlot={
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={onOpenDashboard}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-1.5 h-4 w-4" />
              )}
              Open my Stripe dashboard
            </Button>
            <span className="text-xs text-muted-foreground">
              Your balance, your payout history and your tax forms live there.
            </span>
          </div>
        }
      />

      <p className="text-xs text-muted-foreground">
        You keep <span className="font-medium text-foreground">80%</span> of every
        enrolment; the platform fee is 20% ({SPLIT_LABEL}). Stripe handles payouts,
        tax forms and identity checks.
      </p>
    </section>
  );
}
