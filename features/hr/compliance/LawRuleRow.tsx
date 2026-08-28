// features/hr/compliance/LawRuleRow.tsx
//
// ONE RULE, ONE DENSE ROW (owner ruling, 2026-08-28).
//
// 🚨 A RULE IS A ROW, NOT A PAGE. Collapsed, a rule is a single line: jurisdiction,
// level, status, whatever badge actually changes the reader's decision, and the ONE
// control that acts on it — status and action on the same row. Everything else lives
// behind the chevron. The previous build rendered every rule as a full card with its
// `basis` prose on screen at all times; nobody reads a page built like that.
//
// 🚨 DIM TEXT IS NOT DECORATION. Primary content — rule names, parameter keys and
// values, statuses, citations, the removal notice — is `text-foreground`. Muted tone
// is reserved for genuinely secondary annotations (an effective-date range, a source-
// confidence note). Never for anything the reader is actually here to read.
//
// 🚨 `advisory` IS NOT A WEAKER `active`. It is law we hold and have NOT verified,
// and the engines treat it that way: it flags, it warns, it never computes pay.
//
// 🚨 A NON-EMPTY `unverified_keys` MEANS ANY MONEY BEHIND THOSE KEYS IS PENDING.
// The owner named the worked example: `pto-payout-at-termination` with `excludes`
// unverified — we do not know what that state excludes, so a payout derived from it
// is withheld rather than shown as a dollar figure. Said in two lines, at the rule.
//
// The citation `url` is often a repo-relative research path, not a web address, so it
// is an anchor ONLY when it actually is one. A dead legal citation link is worse than
// plain text.

"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { HrLawCitation, HrOrgLawRule, HrPlatformLawRule } from "../types";
import { describeLawValue, displayableParameters, humanizeLawKey } from "./law-parameters";

/** The one class the owner called out by name, and the key that makes it dangerous. */
const PTO_PAYOUT_CLASS = "pto-payout-at-termination";
const PTO_PAYOUT_UNVERIFIED_KEY = "excludes";

function isWebLink(url: string | null): boolean {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** An effective-date range — a timestamp, so this is one of the few muted things. */
function effectiveRange(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  if (from && to) return `${from} → ${to}`;
  return from ? `From ${from}` : `Until ${to}`;
}

export function LawCitationLine({ citation }: { citation: HrLawCitation | null }) {
  if (!citation) return null;
  const label =
    [citation.authority, citation.title].filter(Boolean).join(" — ") || citation.url;
  if (!label) return null;
  return (
    <p className="text-xs text-foreground">
      {isWebLink(citation.url) ? (
        <a
          href={citation.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2"
        >
          {label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span>{label}</span>
      )}
      {citation.confidence ? (
        <span className="ml-2 text-muted-foreground">
          {citation.confidence.replace(/_/g, " ")}
        </span>
      ) : null}
    </p>
  );
}

/**
 * The parameters as compact key/values. Nested objects are walked ONE level and
 * then handed to the raw view — a deeper flattening reads like a sentence and is not.
 */
export function LawParameterList({
  parameters,
  depth = 0,
}: {
  parameters: Record<string, unknown>;
  depth?: number;
}) {
  const entries = displayableParameters(parameters);
  if (entries.length === 0) {
    return (
      <p className="text-xs text-foreground">
        No parameters — the content of this rule is that it applies.
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
      {entries.map(([key, value]) => {
        const text = describeLawValue(value);
        if (text !== null) {
          return (
            <div key={key} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="truncate text-xs text-foreground">{humanizeLawKey(key)}</dt>
              <dd className="truncate text-xs font-semibold text-foreground">{text}</dd>
            </div>
          );
        }
        const nested =
          typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
        return (
          <div key={key} className="min-w-0 sm:col-span-2">
            <p className="text-xs font-semibold text-foreground">{humanizeLawKey(key)}</p>
            {nested && depth < 1 ? (
              <div className="mt-0.5 border-l border-border pl-3">
                <LawParameterList parameters={nested} depth={depth + 1} />
              </div>
            ) : (
              <p className="text-xs text-foreground">
                {Array.isArray(value)
                  ? `${value.length} entr${value.length === 1 ? "y" : "ies"} — see exact values.`
                  : "Structured — see exact values."}
              </p>
            )}
          </div>
        );
      })}
    </dl>
  );
}

export function LawRawParameters({ parameters }: { parameters: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-0">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-xs text-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mr-1 h-3 w-3" />
        ) : (
          <ChevronRight className="mr-1 h-3 w-3" />
        )}
        Exact values
      </Button>
      {open ? (
        <pre className="mt-1 max-h-48 overflow-auto rounded border border-border bg-muted/40 p-2 text-xs text-foreground">
          {JSON.stringify(parameters, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

export function LawStatusBadge({ status }: { status: "active" | "advisory" }) {
  return status === "active" ? (
    <Badge variant="success">Binding</Badge>
  ) : (
    <Badge variant="warning">Advisory</Badge>
  );
}

/** Two lines, at the rule, in the words an HR admin needs. Never a paragraph. */
function PendingVerificationNote({
  ruleClass,
  unverifiedKeys,
}: {
  ruleClass: string;
  unverifiedKeys: string[];
}) {
  const ptoPayout =
    ruleClass === PTO_PAYOUT_CLASS && unverifiedKeys.includes(PTO_PAYOUT_UNVERIFIED_KEY);

  return (
    <p className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-foreground">
      <span className="font-semibold">
        Pending verification: {unverifiedKeys.map(humanizeLawKey).join(", ")}.
      </span>{" "}
      {ptoPayout
        ? "Payouts that depend on these exclusions are withheld, never shown as a figure."
        : "Nothing computes from these values until they are verified."}
    </p>
  );
}

/**
 * The chevron + identity half of a row. Kept separate from the action control so
 * the control is never nested inside the expand button.
 */
function RowChevron({ open }: { open: boolean }) {
  return open ? (
    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-foreground" />
  ) : (
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-foreground" />
  );
}

/**
 * ONE platform rule.
 *
 * `control` is the D26 applies/removed control, owned by the surface — this row
 * renders it but never decides what removal means or calls the door itself.
 */
export function PlatformLawRuleRow({
  rule,
  control,
}: {
  rule: HrPlatformLawRule;
  control?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const range = effectiveRange(rule.effective_from, rule.effective_to);

  return (
    <div
      className={cn(
        "border-b border-border last:border-b-0",
        rule.opted_out && "bg-destructive/5",
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left"
        >
          <RowChevron open={open} />
          <span className="truncate text-sm font-medium text-foreground">
            {rule.jurisdiction_name ?? rule.jurisdiction_key}
          </span>
          {rule.jurisdiction_level ? (
            <Badge variant="outline">{rule.jurisdiction_level}</Badge>
          ) : null}
          <LawStatusBadge status={rule.status} />
          {rule.unverified_keys.length > 0 ? (
            <Badge variant="warning">Pending verification</Badge>
          ) : null}
          {rule.produces_money ? <Badge variant="info">Affects pay</Badge> : null}
          {rule.opted_out ? (
            <Badge variant="destructive">Removed by your organization</Badge>
          ) : null}
          {!rule.applies_to_org ? (
            <Badge variant="neutral">Not in your jurisdictions</Badge>
          ) : null}
        </button>
        {control ?? null}
      </div>

      {open ? (
        <div className="space-y-1.5 px-2 pb-2 pl-7">
          <LawParameterList parameters={rule.parameters} />
          {rule.unverified_keys.length > 0 ? (
            <PendingVerificationNote
              ruleClass={rule.rule_class}
              unverifiedKeys={rule.unverified_keys}
            />
          ) : null}
          <LawCitationLine citation={rule.citation} />
          {rule.basis ? (
            <p className="max-h-24 overflow-y-auto text-xs leading-relaxed text-foreground">
              {rule.basis}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LawRawParameters parameters={rule.parameters} />
            {range ? <span className="text-xs text-muted-foreground">{range}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** ONE rule this organization authored. Same density, edit + retire on the row. */
export function OrgLawRuleRow({
  rule,
  onEdit,
  onRetire,
  busy,
}: {
  rule: HrOrgLawRule;
  onEdit: () => void;
  onRetire: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const range = effectiveRange(rule.effective_from, rule.effective_to);

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left"
        >
          <RowChevron open={open} />
          <span className="truncate text-sm font-medium text-foreground">
            {rule.rule_class_label}
          </span>
          <Badge variant="outline">{rule.jurisdiction_name ?? rule.jurisdiction_key}</Badge>
          <Badge variant="secondary">Your rule</Badge>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={onEdit}
            disabled={busy}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={onRetire}
            disabled={busy}
          >
            Retire
          </Button>
        </div>
      </div>

      {open ? (
        <div className="space-y-1.5 px-2 pb-2 pl-7">
          <LawParameterList parameters={rule.parameters} />
          <LawCitationLine citation={rule.citation} />
          {rule.basis ? (
            <p className="max-h-24 overflow-y-auto text-xs leading-relaxed text-foreground">
              {rule.basis}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <LawRawParameters parameters={rule.parameters} />
            {range ? <span className="text-xs text-muted-foreground">{range}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
