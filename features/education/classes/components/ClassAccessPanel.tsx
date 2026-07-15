"use client";

// features/education/classes/components/ClassAccessPanel.tsx
//
// The Join / Request / Enroll surface for a NON-OWNER viewing a class. Renders the
// right call-to-action for the class's access mode + the caller's current status:
//   open   → "Join class" (immediate)
//   closed → "Request to join" → "Request pending" once sent
//   paid   → "Enroll" → needs_purchase gate → "Get access" (STUB purchase) → enroll
// Active members get a compact "Enrolled" row + Leave. Owner controls live in the
// roster panel, not here. All actions run through the role-gated edu_class_* RPCs.

import { useState } from "react";
import { toast } from "sonner";
import { Check, LogOut, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACCESS_MODES } from "../constants";
import { AccessModeBadge } from "./AccessModeBadge";
import type { UseClassAccessReturn } from "../hooks/useClassAccess";

export function ClassAccessPanel({
  access,
}: {
  access: UseClassAccessReturn;
}) {
  const { state, acting } = access;
  const [needsPurchase, setNeedsPurchase] = useState(false);

  if (!state || state.isOwner) return null;

  const { accessMode, myStatus } = state;
  const modeMeta = ACCESS_MODES.find((m) => m.value === accessMode);

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
    else if (r.status === "needs_purchase") setNeedsPurchase(true);
  }

  async function handleRequest() {
    const r = await access.request();
    if (!r) return;
    if (r.status === "pending") toast.success("Request sent — the owner will review it.");
    else if (r.status === "joined") toast.success("You joined the class.");
  }

  async function handlePurchase() {
    const r = await access.purchase();
    if (!r) return;
    if (r.status === "entitled") {
      // Grant conferred — immediately complete enrolment.
      const j = await access.join();
      if (j?.status === "joined") toast.success("Enrolled — welcome to the class.");
      setNeedsPurchase(false);
    } else if (r.status === "already_member") {
      toast.success("You already have access.");
      setNeedsPurchase(false);
    }
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
            <Button size="sm" className="gap-1.5" disabled={busy} onClick={handleJoin}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Complete enrolment
            </Button>
          ) : needsPurchase || myStatus === null ? (
            <>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={needsPurchase ? handlePurchase : handleJoin}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {needsPurchase ? "Get access" : "Enroll"}
              </Button>
              <p className="text-[11px] italic text-muted-foreground">
                Payments are a stub for now — real checkout (Stripe Connect) is
                coming. Free preview material stays open.
              </p>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
