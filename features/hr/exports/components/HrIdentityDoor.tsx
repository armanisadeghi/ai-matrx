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
 * 🚨 WHY AN EMPLOYMENT DOES **NOT** USE `hrEmployeeHref`, EVEN THOUGH THAT BUILDER EXISTS.
 * Two reasons, either one sufficient. First, `/hr/people/[employeeId]` has no page file — linking
 * there is a 404, which is a worse dead end than a declared promise. Second and more important:
 * an EMPLOYMENT is not an EMPLOYEE. `details.unmapped[].employment_id` is an employment row; one
 * person can hold several over time, and several at once. Feeding an employment id to a route
 * that expects an employee id is the "a wrong door opens a DIFFERENT record" failure — the exact
 * mistake `MatrxColumnDef.fk.token` warns about — and on a payroll screen it would show the wrong
 * person's pay setup. When an employment surface exists, this door points at it and the registered
 * promise is deleted.
 *
 * The id is shown in short form with the full value in the title, because a payroll administrator
 * chasing an unmapped employment needs the actual UUID to hand to whoever can fix it.
 */

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { hrPayPeriodHref } from "@/features/hr/routes";
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

/**
 * The pay period DOES have a route (rows 32/33), so it gets a real link, not a promise.
 *
 * 🚨 THE HREF IS BUILT BY `hrPayPeriodHref`, NEVER BY A TEMPLATE LITERAL HERE. HR is strictly
 * single-employer and resolves the active employer from `?org=` BEFORE the user's active-org
 * selection, so a hand-assembled URL that drops the param silently lands the reader in a
 * different employer's period — merging two employers' pay data, which is a compliance defect
 * rather than a cosmetic one. `features/hr/routes.ts` is the one place that cannot forget.
 */
export function PayPeriodDoor({
  payPeriodId,
  orgRef,
  label,
  className,
}: {
  payPeriodId: string;
  /** The employer this row belongs to — a slug or a uuid, carried straight through. */
  orgRef?: string | null;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={hrPayPeriodHref(payPeriodId, orgRef)}
      title={payPeriodId}
      className={cn(DOOR_CLASS, className)}
    >
      {label ?? shortId(payPeriodId)}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </Link>
  );
}
