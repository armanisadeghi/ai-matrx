/**
 * features/hr/leave/components/LeaveBalanceBlock.tsx
 *
 * 🚨 THE HONESTY LAW (SPEC-LEAVE §5), IN ONE COMPONENT.
 * *"A balance is five numbers and a sentence, or it is a lie."*
 *
 * Every balance block in the product renders THIS component with the SAME five figures:
 * `/hr/me/time-off`, `/hr/leave/balances`, the `/hr` home card, the manager team view, and
 * the request form's live preview. One number labelled "PTO: 42.5" is the single
 * most-disputed figure in any HR product, and a second implementation of this block is how
 * two screens end up disagreeing about the same person's time.
 *
 * The four rules this component exists to keep:
 *
 *  1. **THE SENTENCE IS THE SERVER'S.** `hr._leave_sentence` owns every wording in §5 — the
 *     cap sentence, the per-hours-worked sentence, the not-yet-usable sentence, the negative
 *     sentence. It is rendered VERBATIM. A client that composes policy prose is a second
 *     implementation of policy.
 *  2. **UNLIMITED RENDERS THE WORD.** `hr.leave_figures` returns SEVEN keys for an unlimited
 *     policy and stops — there are no five figures to show. No number, no zero, no bar.
 *  3. **NULL IS WITHHELD, NEVER `0`.** A figure the server did not send renders dark with the
 *     reason. `0.0` hours available and "we were not told" are different facts and an
 *     employee acts differently on each.
 *  4. **EVERY FIGURE IS A DOOR** to the ledger rows that produced it (§12) — and a door that
 *     cannot be built exactly is not built at all (see `PENDING` below).
 */

"use client";

import Link from "next/link";
import { AlertTriangle, Infinity as InfinityIcon, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

import type { LeaveFigures } from "../api/types";
import type { LeaveLedgerFilter } from "./LeaveLedgerView";

/** Display-only formatting. No arithmetic happens on this screen. */
export function formatHours(value: number | null): string | null {
  if (value === null) return null;
  const fixed = Math.abs(value % 1) < 1e-9 ? value.toFixed(0) : value.toFixed(2);
  return `${fixed} h`;
}

function withFilter(href: string, filter: LeaveLedgerFilter): string {
  return href.includes("?") ? `${href}&show=${filter}` : `${href}?show=${filter}`;
}

/**
 * One figure. `value === null` means the server did not send it — the tile stays dark and
 * says why, instead of printing a number nobody computed.
 */
function Figure({
  label,
  value,
  definition,
  href,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  /** The §5 definition, so the person can see what this number counts. */
  definition: string;
  /** The ledger door. Absent (not disabled) when no exact door exists. */
  href: string | null;
  emphasis?: boolean;
}) {
  const shown = formatHours(value);

  const body = (
    <>
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        {href ? <ArrowUpRight className="h-3 w-3 shrink-0 opacity-60" aria-hidden /> : null}
      </span>
      {shown === null ? (
        <span className="text-sm font-medium text-muted-foreground/70">
          Not provided
          <span className="sr-only">
            — the server did not send this figure for this policy.
          </span>
        </span>
      ) : (
        <span
          className={cn(
            "tabular-nums font-semibold",
            emphasis ? "text-xl text-foreground" : "text-base text-foreground",
            value !== null && value < 0 ? "text-destructive" : null,
          )}
        >
          {shown}
        </span>
      )}
      <span className="text-[11px] leading-snug text-muted-foreground">{definition}</span>
    </>
  );

  const className = cn(
    "flex min-w-0 flex-col gap-0.5 rounded-md border border-border bg-card p-2.5 text-left",
    emphasis ? "sm:col-span-2 lg:col-span-1" : null,
    href ? "transition-colors hover:border-primary/50 hover:bg-accent/40" : null,
  );

  if (!href) return <div className={className}>{body}</div>;
  return (
    <Link href={href} className={className}>
      {body}
    </Link>
  );
}

export interface LeaveBalanceBlockProps {
  figures: LeaveFigures;
  /** `hr._leave_sentence`'s output, verbatim. Never composed here. */
  sentence: string | null;
  /** The §12 ledger door for this employment + policy. Null → figures render without doors. */
  ledgerHref: string | null;
  /**
   * Where "Pending approval" points. It is NOT a ledger door — see `PENDING` below.
   * An anchor to the request list is the honest destination.
   */
  pendingHref?: string | null;
  /** Shown above the figures when this block is not already under a policy heading. */
  title?: string | null;
  /** Set when the figures are historical or projected, so the block can say which. */
  asOfLabel?: string | null;
  className?: string;
}

/**
 * 🚨 `PENDING APPROVAL` HAS NO LEDGER DOOR, AND THAT IS DELIBERATE.
 * §5's own table says it: *"Σ `requested_hours` over requests in `submitted` — **no ledger
 * entry exists yet**"*. `hr.leave_ledger_view` therefore cannot return the rows behind this
 * figure, because there are none. Pointing it at the ledger anyway would open an empty or —
 * worse — a wrong-rows table under a figure the person is trying to reconcile. It points at
 * their request list instead, which is where those hours actually live.
 *
 * 🚨 `USED` AND `APPROVED UPCOMING` SHARE ONE DOOR, AND THE CHIP SAYS SO.
 * Both are sums over `usage`/`reversal` entries split by the STATE OF THE REQUEST that caused
 * them — and `hr.leave_ledger_view` does not return the request state on an entry. A client
 * filter that split them would be inventing the split. So both open the ledger filtered to
 * time used and returned, and the ledger's own filter chip states exactly what it filtered.
 */
export function LeaveBalanceBlock({
  figures,
  sentence,
  ledgerHref,
  pendingHref = null,
  title = null,
  asOfLabel = null,
  className,
}: LeaveBalanceBlockProps) {
  const unlimited = figures.unlimited === true;
  const identityBroken = figures.identityHolds === false;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {title || asOfLabel ? (
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {title ? (
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          ) : (
            <span />
          )}
          {asOfLabel ? (
            <span className="text-xs text-muted-foreground">{asOfLabel}</span>
          ) : null}
        </div>
      ) : null}

      {/*
        🚨 THE ARITHMETIC BANNER. `identity_holds` is the SERVER's verdict on
        accrued − used − upcoming − removed = ledger_balance. It fires ONLY on an explicit
        `false`: a policy that never computed it (unlimited) sends `null`, and treating that
        as a failure would scream on every unlimited policy in the org.
      */}
      {identityBroken ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-destructive">
              These figures do not add up to the ledger.
            </p>
            <p className="mt-0.5 text-destructive/90">
              The server checked accrued minus used, upcoming and removed time against the
              recorded balance, and they disagree. Treat every number below as unconfirmed and
              open the ledger before acting on it.
            </p>
            {ledgerHref ? (
              <Link
                href={ledgerHref}
                className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-destructive underline underline-offset-2"
              >
                Open the ledger
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      {unlimited ? (
        /*
          §5: "Unlimited — requests still need approval." NO NUMBER, NO BAR, NO ZERO.
          `hr.leave_figures` sends no figures at all for this policy, so there is literally
          nothing to render but the word and the server's sentence.
        */
        <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3">
          <InfinityIcon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="text-xl font-semibold text-foreground">Unlimited</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Figure
            label="Available"
            value={figures.available}
            definition="What you can book right now."
            href={ledgerHref}
            emphasis
          />
          <Figure
            label="Accrued to date"
            value={figures.accruedToDate}
            definition="Everything ever added."
            href={ledgerHref ? withFilter(ledgerHref, "added") : null}
          />
          <Figure
            label="Used (taken)"
            value={figures.usedTaken}
            definition="Time already taken."
            href={ledgerHref ? withFilter(ledgerHref, "used") : null}
          />
          <Figure
            label="Approved upcoming"
            value={figures.approvedUpcoming}
            definition="Granted, not yet taken."
            href={ledgerHref ? withFilter(ledgerHref, "used") : null}
          />
          <Figure
            label="Pending approval"
            value={figures.pendingApproval}
            definition="Asked for, not yet decided."
            href={pendingHref}
          />
        </div>
      )}

      {/* 🚨 VERBATIM. Never reworded, never assembled from the figures above. */}
      {sentence ? (
        <p className="text-sm text-muted-foreground">{sentence}</p>
      ) : null}
    </div>
  );
}
