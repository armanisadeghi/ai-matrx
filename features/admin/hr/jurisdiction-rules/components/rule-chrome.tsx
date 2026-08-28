// features/admin/hr/jurisdiction-rules/components/rule-chrome.tsx
//
// The small pieces every jurisdiction-rules surface shares: status badges, the
// pending-verification flag, citation rendering, and the refusal / failure
// states. Kept together so the three routes cannot drift into three different
// vocabularies for the same fact.

"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  FlaskConical,
  Loader2,
  ShieldAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type {
  JurisdictionAdminLoad,
  JurisdictionRuleCitation,
  JurisdictionRuleFixture,
} from "../types";

export function RuleStatusBadge({ status }: { status: string }) {
  const variant =
    status === "active"
      ? "success"
      : status === "advisory"
        ? "warning"
        : status === "superseded"
          ? "outline"
          : "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}

/**
 * 🚨 THE PENDING-VERIFICATION LAW. A rule whose parameters carry `_unverified`
 * keys is never presented as settled anywhere on this surface. When the class
 * also produces money, the flag says so out loud: an unverified key on a
 * money rule is a number we are not willing to pay on.
 */
export function PendingVerificationFlag({
  unverifiedKeys,
  producesMoney,
  className,
}: {
  unverifiedKeys: readonly string[];
  producesMoney: boolean;
  className?: string;
}) {
  if (unverifiedKeys.length === 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
        producesMoney
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
        className,
      )}
      title={`Pending verification: ${unverifiedKeys.join(", ")}`}
    >
      <AlertTriangle className="h-3 w-3" />
      Pending verification
      {producesMoney ? " · money withheld" : null}
      <span className="font-normal opacity-80">
        ({unverifiedKeys.join(", ")})
      </span>
    </span>
  );
}

/**
 * 🚨 AN INTERNAL DOC PATH IS NOT AN EXTERNAL AUTHORITY. Seeded rows carry
 * citation URLs like `/projects/hr-domain/specs/SPEC-JURISDICTION.md` — our own
 * research, written by us. Rendering those as a "source" link would both dead-end
 * (the path is not a route on this site) and, worse, dress our own notes up as a
 * legal source at the exact moment a superadmin is deciding whether to make a
 * rule binding. Only an absolute http(s) URL counts.
 */
export function externalCitationUrl(url: string | null | undefined): string | null {
  return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
}

export function CitationLine({
  citation,
}: {
  citation: JurisdictionRuleCitation | null;
}) {
  if (!citation) {
    return <span className="text-muted-foreground">No citation recorded</span>;
  }
  const href = externalCitationUrl(citation.url);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-foreground">{citation.authority ?? "—"}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          source
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span className="text-amber-700 dark:text-amber-400">
          own research — no external source
        </span>
      )}
    </span>
  );
}

export function FixtureSummary({
  fixtures,
}: {
  fixtures: readonly JurisdictionRuleFixture[];
}) {
  if (fixtures.length === 0) {
    return <span className="text-muted-foreground">no fixtures</span>;
  }
  // `expected_status` is the fixture's OWN verification state: `asserted` (the
  // expectation is settled law) or `pending_verification` (the expectation is
  // itself waiting on a source). Only the latter is pending — treating
  // "anything but passing" as pending reported every settled fixture as an
  // outstanding one.
  const pending = fixtures.filter(
    (fixture) => fixture.expected_status === "pending_verification",
  ).length;
  return (
    <span className="inline-flex items-center gap-1">
      <FlaskConical className="h-3 w-3 text-muted-foreground" />
      <span>{fixtures.length} fixtures</span>
      {pending > 0 ? (
        <span className="text-amber-700 dark:text-amber-400">
          · {pending} pending
        </span>
      ) : null}
    </span>
  );
}

export function SeedTaskChip({ task }: { task: string | null }) {
  if (!task) return null;
  return (
    <Link
      href={`/administration/hr/jurisdiction-rules/verification#${task}`}
      className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
    >
      {task}
    </Link>
  );
}

/** Superadmin refusal — D25's own words, rendered, never thrown. */
export function RuleAccessRefusal({
  reason,
  detail,
}: {
  reason: string;
  detail: string | null;
}) {
  const superadmin = reason === "not_superadmin";
  return (
    <div className="m-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">
            {superadmin
              ? "Superadmin only"
              : "This surface is not open to you right now"}
          </p>
          <p className="text-sm text-muted-foreground">
            {detail ??
              (superadmin
                ? "Employment-law rules are promoted and demoted by a superadmin from the admin portal. Your admin level does not carry that authority (D25, 2026-08-28)."
                : `The database refused this request: ${reason}.`)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function RuleLoadFailure({
  message,
  technical,
}: {
  message: string;
  technical: string | null;
}) {
  return (
    <div className="m-4 rounded-lg border border-destructive/40 bg-destructive/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">{message}</p>
          {technical ? (
            <p className="font-mono text-xs text-muted-foreground">
              {technical}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function RuleDataLoading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
}

/**
 * Renders the two non-`ok` states so each page can guard with one line.
 * Returns `null` when there is data to show.
 */
export function RuleLoadGate({
  load,
  loading,
  loadingLabel,
}: {
  load: JurisdictionAdminLoad | null;
  loading: boolean;
  loadingLabel: string;
}) {
  if (loading && !load) return <RuleDataLoading label={loadingLabel} />;
  if (!load) return null;
  if (load.state === "refused") {
    return <RuleAccessRefusal reason={load.reason} detail={load.detail} />;
  }
  if (load.state === "failed") {
    return (
      <RuleLoadFailure message={load.message} technical={load.technical} />
    );
  }
  return null;
}

export function formatDateRange(
  from: string | null,
  to: string | null,
): string {
  if (!from && !to) return "—";
  return `${from ?? "—"} → ${to ?? "open"}`;
}
