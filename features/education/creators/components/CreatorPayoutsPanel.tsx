"use client";

// features/education/creators/components/CreatorPayoutsPanel.tsx
//
// The creator EARNINGS surface on the dashboard. Shows Stripe Connect status and
// the right next action: connect / finish onboarding / open the Stripe Express
// dashboard (Stripe HOSTS the payout + earnings UI — we link, we don't rebuild).
// Reads status via /api/stripe/connect/status; refreshes when the creator returns
// from the hosted onboarding flow (?connect=return). All money movement is server-
// side; this island only kicks off the hosted redirects.

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeDollarSign,
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SPLIT_LABEL } from "@/lib/stripe/connect";
import {
  getConnectStatus,
  openConnectDashboard,
  startConnectOnboarding,
  type ConnectStatus,
} from "../service";

export function CreatorPayoutsPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Imperative refresh for event handlers (button clicks). Effects inline the
  // promise chain instead (setState lands only in a .then, never synchronously).
  const load = useCallback(() => {
    getConnectStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, configured: true }))
      .finally(() => setLoading(false));
  }, []);

  // Load once on mount.
  useEffect(() => {
    getConnectStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, configured: true }))
      .finally(() => setLoading(false));
  }, []);

  // Returned from hosted onboarding — refresh + toast once.
  const connectParam = searchParams.get("connect");
  useEffect(() => {
    if (connectParam !== "return") return;
    toast.success("Thanks — we'll confirm your payout setup.");
    getConnectStatus()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, configured: true }));
  }, [connectParam]);

  async function onConnect() {
    setBusy(true);
    try {
      const r = await startConnectOnboarding();
      if (r.url) {
        window.location.assign(r.url);
        return;
      }
      toast.error(r.connectDisabled ? "Payouts aren't switched on yet" : "Could not start onboarding", {
        description: r.error,
      });
    } finally {
      setBusy(false);
    }
  }

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
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <BadgeDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        <h2 className="text-sm font-semibold text-foreground">Earnings &amp; payouts</h2>
      </div>

      {loading ? (
        <Skeleton className="h-20 w-full" />
      ) : !status?.configured ? (
        <p className="text-sm text-muted-foreground">
          Payouts aren&apos;t configured on this environment yet.
        </p>
      ) : !status.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect a Stripe account to sell paid classes and get paid. You keep{" "}
            <span className="font-medium text-foreground">80%</span> of every
            enrolment; the platform fee is 20%. Stripe handles payouts, tax forms,
            and identity — you just connect once.
          </p>
          <Button disabled={busy} onClick={onConnect}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BadgeDollarSign className="mr-1.5 h-4 w-4" />}
            Connect Stripe to get paid
          </Button>
        </div>
      ) : status.chargesEnabled ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-foreground">
              Payouts active — you&apos;re ready to sell paid classes.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" disabled={busy} onClick={onOpenDashboard}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
              Open Stripe payout dashboard
            </Button>
            <span className="text-xs text-muted-foreground">
              Revenue split: {SPLIT_LABEL}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span className="text-foreground">
              {status.detailsSubmitted
                ? "Stripe is reviewing your details — payouts activate shortly."
                : "Finish your Stripe onboarding to start receiving payouts."}
            </span>
          </div>
          <Button disabled={busy} onClick={onConnect}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <BadgeDollarSign className="mr-1.5 h-4 w-4" />}
            Finish onboarding
          </Button>
        </div>
      )}
    </section>
  );
}
