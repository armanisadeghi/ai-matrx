"use client";

/**
 * HrIdentityDoor — the door for an HR identity whose own surface does not exist yet.
 *
 * NO DEAD ENDS: if the UI names a thing that has an identity in our system, the user must be able
 * to reach it. The export lane names three of them — an employment, a workweek, a pay period —
 * and only the pay period has a route today. The other two get the platform's REGISTERED
 * primitive (`lib/coming-soon/registry.ts` + `announceComingSoon`), never a bare toast and never
 * an inert grey span: the promise is declared, countable, and reviewable, and the user gets a real
 * answer instead of a click that does nothing.
 *
 * The id is shown in short form with the full value in the title, because a payroll administrator
 * chasing an unmapped employee needs the actual UUID to hand to whoever can fix it.
 */

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";

/** Which registered promise a not-yet-built identity opens. */
export type HrIdentityKind = "employment" | "workweek";

const COMING_SOON_ID: Record<HrIdentityKind, string> = {
  employment: "hr.employment-record",
  workweek: "hr.workweek-detail",
};

function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

const DOOR_CLASS =
  "inline-flex items-center gap-1 rounded-sm font-mono text-xs text-primary underline underline-offset-2 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function HrIdentityDoor({
  kind,
  id,
  label,
  className,
}: {
  kind: HrIdentityKind;
  id: string;
  /** Overrides the shortened id as the visible text. */
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={id}
      onClick={() => void announceComingSoon(COMING_SOON_ID[kind])}
      className={cn(DOOR_CLASS, className)}
    >
      {label ?? shortId(id)}
    </button>
  );
}

/** The pay period DOES have a route (row 32/33), so it gets a real link, not a promise. */
export function PayPeriodDoor({
  payPeriodId,
  label,
  className,
}: {
  payPeriodId: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/hr/time/periods/${payPeriodId}`}
      title={payPeriodId}
      className={cn(DOOR_CLASS, className)}
    >
      {label ?? shortId(payPeriodId)}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </Link>
  );
}
