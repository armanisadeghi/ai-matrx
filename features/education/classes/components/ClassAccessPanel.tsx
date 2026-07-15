"use client";

// features/education/classes/components/ClassAccessPanel.tsx
//
// The Join / Request / Enroll surface for a NON-OWNER viewing a class. Renders the
// right call-to-action for the class's access mode + the caller's current status:
//   open   → "Join class" (immediate)
//   closed → "Request to join" → "Request pending" once sent
//   paid   → "Enroll — $X" → Stripe Checkout (Connect) → webhook confers enrolment
// Active members get a compact "Enrolled" row + Leave. Owner controls live in the
// roster panel, not here. Paid access is conferred ONLY by the Stripe webhook —
// this component never grants access (webhook-only paid gate).

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Check, LogOut, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCESS_MODES } from "../constants";
import { formatPriceCents } from "@/lib/stripe/connect";
import { AccessModeBadge } from "./AccessModeBadge";
import type { UseClassAccessReturn } from "../hooks/useClassAccess";

export function ClassAccessPanel({
  access,
}: {
  access: UseClassAccessReturn;
}) {
  const { state, acting } = access;
  const searchParams = useSearchParams();

  // Returned from Stripe Checkout — refresh state so the freshly-conferred
  // enrolment shows immediately, and toast the outcome once.
  const enrolled = searchParams.get("enrolled");
  useEffect(() => {
    if (enrolled === "1") {
      void access.refresh();
      toast.success("Payment received — welcome to the class.");
    } else if (enrolled === "cancelled") {
      toast.info("Checkout cancelled — you can enrol anytime.");
    }
  }, [enrolled]);

  if (!state || state.isOwner) return null;

  const { accessMode, myStatus, priceCents } = state;
  const modeMeta = ACCESS_MODES.find((m) => m.value === accessMode);
  const priceLabel = priceCents ? formatPriceCents(priceCents) : null;

  async function handleEnroll() {
    const returnTo =
      typeof window !== "undefined"
        ? window.location.pathname + window.location.search
        : undefined;
    const r = await access.startCheckout(returnTo);
    if (r.alreadyEnrolled) {
      await access.refresh();
      toast.success("You already have access.");
      return;
    }
    if (r.url) {
      window.location.assign(r.url);
      return;
    }
    toast.error(r.error ?? "Could not start checkout.");
  }

  // ── Active member ── compact enrolled row + leave.
  if (myStatus === "active") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
        <span className="flex items-center gap-2 text-sm text-foreground">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          You&apos;re enrolled in this class.
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
          disabled={acting}
          onClick={async () => {
            const r = await access.leave();
            if (r?.status === "left") toast.success("You left the class.");
          }}
        >
          <LogOut className="h-4 w-4" />
          Leave
        </Button>
      </div>
    );
  }

  async function handleJoin() {
    const r = await access.join();
    if (!r) return;
    if (r.status === "joined") toast.success("You joined the class.");
    else if (r.status === "needs_purchase") void handleEnroll();
  }

  async function handleRequest() {
    const r = await access.request();
    if (!r) return;
    if (r.status === "pending") toast.success("Request sent — the owner will review it.");
    else if (r.status === "joined") toast.success("You joined the class.");
  }

  const busy = acting;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <AccessModeBadge mode={accessMode} />
        <span className="text-sm font-medium text-foreground">
          {modeMeta?.short}
        </span>
      </div>
      <p className="text-xs leading-snug text-muted-foreground">
        {modeMeta?.description}
      </p>

      {/* OPEN */}
      {accessMode === "open" && (
        <Button size="sm" className="gap-1.5" disabled={busy} onClick={handleJoin}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Join class
        </Button>
      )}

      {/* CLOSED */}
      {accessMode === "closed" && (
        <Button
          size="sm"
          className="gap-1.5"
          disabled={busy || myStatus === "pending"}
          onClick={handleRequest}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {myStatus === "pending" ? "Request pending" : "Request to join"}
        </Button>
      )}

      {/* PAID */}
      {accessMode === "paid" && (
        <div className="space-y-2">
          {myStatus === "entitled" ? (
            // Legacy comp grant (owner comped access before enrolment) — join to
            // complete. Paid purchasers are enrolled directly by the webhook.
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={handleJoin}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Complete enrolment
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={handleEnroll}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {priceLabel ? `Enroll — ${priceLabel}` : "Enroll"}
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Secure checkout by Stripe. Free preview material stays open.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
