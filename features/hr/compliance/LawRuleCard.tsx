// features/hr/compliance/LawRuleCard.tsx
//
// ONE RULE, READ BY A NON-LAWYER (D25).
//
// 🚨 `advisory` IS NOT A WEAKER `active`. It is law we hold and have NOT verified,
// and the engines treat it that way: it flags, it warns, and it never computes pay.
// So it is visually distinct here — a warning badge and its own sentence — because
// an HR admin who reads an advisory rule as binding will plan around a number the
// platform will never produce.
//
// 🚨 A NON-EMPTY `unverified_keys` MEANS ANY MONEY BEHIND THOSE KEYS IS PENDING,
// NEVER AUTHORITATIVE. The owner named the worked example: `pto-payout-at-termination`
// with `excludes` unverified. We do not know which categories that state excludes from
// a payout, so a payout figure derived from it would be a dollar amount we cannot
// stand behind. It is called out in amber, at the rule, in words.
//
// The citation `url` is often a repo-relative research path, not a web address, so it
// is rendered as a link ONLY when it actually is one. A dead anchor on a legal
// citation is worse than plain text.

"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { HrLawCitation, HrOrgLawRule, HrPlatformLawRule } from "../types";
import {
  describeLawValue,
  displayableParameters,
  humanizeLawKey,
} from "./law-parameters";

/** The one class the owner called out by name, and the key that makes it dangerous. */
const PTO_PAYOUT_CLASS = "pto-payout-at-termination";
const PTO_PAYOUT_UNVERIFIED_KEY = "excludes";

function isWebLink(url: string | null): boolean {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

export function LawCitationLine({ citation }: { citation: HrLawCitation | null }) {
  if (!citation) return null;
  const label =
    [citation.authority, citation.title].filter(Boolean).join(" — ") || citation.url;
  if (!label) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {isWebLink(citation.url) ? (
        <a
          href={citation.url ?? "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
        >
          {label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <span>{label}</span>
      )}
      {citation.confidence ? (
        <span className="ml-2 text-muted-foreground/80">
          Source confidence: {citation.confidence.replace(/_/g, " ")}
        </span>
      ) : null}
    </p>
  );
}

/**
 * The parameters in words. Nested objects are walked ONE level and then handed to
 * the raw view — a deeper flattening reads like a sentence and is not one.
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
      <p className="text-sm text-muted-foreground">
        This rule carries no parameters — its content is the fact that it applies.
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
      {entries.map(([key, value]) => {
        const text = describeLawValue(value);
        if (text !== null) {
          return (
            <div key={key} className="flex min-w-0 items-baseline justify-between gap-3">
              <dt className="truncate text-xs text-muted-foreground">
                {humanizeLawKey(key)}
              </dt>
              <dd className="truncate text-sm font-medium text-foreground">{text}</dd>
            </div>
          );
        }
        const nested =
          typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : null;
        return (
          <div key={key} className="min-w-0 sm:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">
              {humanizeLawKey(key)}
            </p>
            {nested && depth < 1 ? (
              <div className="mt-1 border-l border-border pl-3">
                <LawParameterList parameters={nested} depth={depth + 1} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {Array.isArray(value)
                  ? `${value.length} entr${value.length === 1 ? "y" : "ies"} — open the exact values below.`
                  : "Structured detail — open the exact values below."}
              </p>
            )}
          </div>
        );
      })}
    </dl>
  );
}

export function LawRawParameters({
  parameters,
}: {
  parameters: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs text-muted-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="mr-1 h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="mr-1 h-3.5 w-3.5" />
        )}
        Exact values
      </Button>
      {open ? (
        <pre className="mt-1 max-h-64 overflow-auto rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
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
    <Badge variant="warning">Advisory — not yet verified</Badge>
  );
}

/** Amber, at the rule, in the words an HR admin needs. */
function PendingVerificationCallout({
  ruleClass,
  unverifiedKeys,
}: {
  ruleClass: string;
  unverifiedKeys: string[];
}) {
  const ptoPayout =
    ruleClass === PTO_PAYOUT_CLASS &&
    unverifiedKeys.includes(PTO_PAYOUT_UNVERIFIED_KEY);

  return (
    <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="space-y-1 text-sm">
        <p className="font-medium text-foreground">
          Pending verification: {unverifiedKeys.map(humanizeLawKey).join(", ")}
        </p>
        <p className="text-muted-foreground">
          {ptoPayout
            ? "We have not verified which categories this jurisdiction excludes from a payout. " +
              "Any payout that depends on those exclusions is withheld and flagged as pending " +
              "verification — it is never presented as an authoritative dollar figure."
            : "These values have not been verified against the source, so nothing computes from " +
              "them. They are shown so you know what we hold, not as a settled answer."}
        </p>
      </div>
    </div>
  );
}

export function PlatformLawRuleCard({ rule }: { rule: HrPlatformLawRule }) {
  const muted = !rule.applies_to_org;
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card p-3",
        muted && "border-dashed bg-transparent opacity-70",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
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
        {muted ? <Badge variant="neutral">Does not apply to you</Badge> : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {rule.effective_from ? `In force from ${rule.effective_from}` : "No start date"}
          {rule.effective_to ? ` until ${rule.effective_to}` : ""}
        </span>
      </div>

      {rule.basis ? (
        <p className="mt-2 text-sm text-muted-foreground">{rule.basis}</p>
      ) : null}

      <div className="mt-2">
        <LawParameterList parameters={rule.parameters} />
      </div>

      {rule.unverified_keys.length > 0 ? (
        <div className="mt-2">
          <PendingVerificationCallout
            ruleClass={rule.rule_class}
            unverifiedKeys={rule.unverified_keys}
          />
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <LawCitationLine citation={rule.citation} />
        <LawRawParameters parameters={rule.parameters} />
      </div>
    </div>
  );
}

export function OrgLawRuleCard({
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
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {rule.rule_class_label}
        </span>
        <Badge variant="outline">
          {rule.jurisdiction_name ?? rule.jurisdiction_key}
        </Badge>
        <Badge variant="secondary">Your rule</Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {rule.effective_from ? `In force from ${rule.effective_from}` : "No start date"}
          {rule.effective_to ? ` until ${rule.effective_to}` : ""}
        </span>
      </div>

      {rule.basis ? (
        <p className="mt-2 text-sm text-muted-foreground">{rule.basis}</p>
      ) : null}

      <div className="mt-2">
        <LawParameterList parameters={rule.parameters} />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <LawRawParameters parameters={rule.parameters} />
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit} disabled={busy}>
            Edit
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onRetire} disabled={busy}>
            Retire
          </Button>
        </div>
      </div>
    </div>
  );
}
