"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, MessageSquare, Quote, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProTextarea } from "@/components/official/ProTextarea";
import { SEVERITY_LABELS, type RulebookRule, type RuleSeverity } from "../types";
import type { Rulebook } from "../types";
import {
  CHECKUP_KIND_LABELS,
  CHECKUP_KIND_VERBS,
  CONFIDENCE_LABELS,
  chosenProposal,
  confidenceBand,
  type CheckupDisposition,
  type CheckupFinding,
  type CheckupProposedRule,
} from "./types";

/**
 * The split. LEFT is the Rulebook as it stands today; RIGHT is what we suggest
 * instead. Deliberately NOT a word diff (Arman: "not necessarily for a diff…
 * the point is to have it where we can suggest rules that need to be added,
 * rules that could be modified, rules that should be removed"). Both sides
 * render a rule the way a rule is read, so the Expert is comparing MEANING.
 */

function severityBadge(severity: RuleSeverity) {
  const cls =
    severity === "critical"
      ? "border-destructive/50 text-destructive"
      : severity === "major"
        ? "border-primary/40 text-primary"
        : "border-border text-muted-foreground";
  return (
    <Badge variant="outline" className={`px-1.5 py-0 text-[10px] ${cls}`}>
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
        {value}
      </p>
    </div>
  );
}

/** One rule, read as a rule — the same shape on both sides of the split. */
function RuleCard({
  name,
  statement,
  rationale,
  detection,
  severity,
  muted,
}: {
  name: string;
  statement: string;
  rationale?: string;
  detection?: string;
  severity: RuleSeverity;
  muted?: boolean;
}) {
  return (
    <div
      className={`space-y-3 rounded-md border border-border bg-card p-3 ${muted ? "opacity-70" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{name}</span>
        {severityBadge(severity)}
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{statement}</p>
      <Field label="Why it matters" value={rationale} />
      <Field label="How to spot a violation" value={detection} />
    </div>
  );
}

function PaneHeading({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** LEFT — what the Rulebook says today about the finding in focus. */
export function CheckupCurrentPane({
  finding,
  rule,
  rulebook,
}: {
  finding: CheckupFinding;
  rule: RulebookRule | undefined;
  rulebook: Rulebook | null;
}) {
  if (finding.kind === "add") {
    const sectionCode = finding.proposed?.section ?? "G";
    const sectionLabel =
      rulebook?.sections[sectionCode]?.label ?? sectionCode;
    const neighbours = (rulebook?.rules ?? []).filter(
      (r) => r.section === sectionCode && r.retired !== true,
    );
    return (
      <div className="p-3">
        <PaneHeading
          title="Your Rulebook today"
          hint={`Nothing here says this. It would join “${sectionLabel}”.`}
        />
        {neighbours.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This part of your Rulebook is empty so far.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {neighbours.map((r) => (
              <li
                key={r.id}
                className="rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {r.name}
                  </span>
                  {severityBadge(r.severity)}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {r.statement}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="p-3">
        <PaneHeading title="Your Rulebook today" />
        <p className="text-sm text-muted-foreground">
          The rule this is about is no longer in your Rulebook — it was changed
          or retired while the checkup was open, so this suggestion no longer
          applies.
        </p>
        {rulebook ? (
          <Button asChild size="sm" variant="outline" className="mt-2">
            <Link href={`/masterwork/${rulebook.id}`} target="_blank">
              Open the Rulebook
            </Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <PaneHeading
        title="Your Rulebook today"
        hint={
          finding.kind === "remove"
            ? "This is the rule we think no longer holds."
            : "This is what the rule says right now."
        }
      />
      <RuleCard
        name={rule.name}
        statement={rule.statement}
        {...(rule.rationale ? { rationale: rule.rationale } : {})}
        {...(rule.detection ? { detection: rule.detection } : {})}
        severity={rule.severity}
      />
      {rule.quote ? (
        <blockquote className="border-l-2 border-border pl-2 text-sm italic text-muted-foreground">
          “{rule.quote}”
        </blockquote>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Rule id: <code className="font-mono">{rule.id}</code> — audits cite
        this id, and it never changes.
      </p>
    </div>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence);
  const percent = Math.round(confidence * 100);
  const tone =
    band === "sure"
      ? "bg-primary"
      : band === "likely"
        ? "bg-amber-500"
        : "bg-destructive";
  const text =
    band === "sure"
      ? "text-muted-foreground"
      : band === "likely"
        ? "text-amber-600 dark:text-amber-500"
        : "text-destructive";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={text}>{CONFIDENCE_LABELS[band]}</span>
        <span className="text-muted-foreground">{percent}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/** The Expert's own words — with the door back to where they said them. */
function Evidence({ finding }: { finding: CheckupFinding }) {
  if (!finding.evidence.trim()) return null;
  const ref = finding.evidence_ref;
  const conversationHref = ref?.conversation_id
    ? `/chat/${ref.conversation_id}`
    : null;
  const fileHref = ref?.file_id ? `/files/f/${ref.file_id}` : null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Quote className="h-3 w-3" />
        Your own words
      </div>
      <blockquote className="border-l-2 border-primary/40 pl-2 text-sm italic text-foreground">
        “{finding.evidence}”
      </blockquote>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {conversationHref ? (
          <Link
            href={conversationHref}
            target="_blank"
            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            See where you said it
          </Link>
        ) : null}
        {fileHref ? (
          <Link
            href={fileHref}
            target="_blank"
            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
          >
            <FileText className="h-3 w-3" />
            Open the source
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** RIGHT — what we suggest, the options, and the Expert's own corrections. */
export function CheckupProposalPane({
  finding,
  disposition,
  onChoose,
  onEdit,
}: {
  finding: CheckupFinding;
  disposition: CheckupDisposition | undefined;
  onChoose: (alternativeIndex: number) => void;
  onEdit: (proposal: CheckupProposedRule | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const chosen = chosenProposal(finding, disposition);
  const options = [
    ...(finding.proposed ? [finding.proposed] : []),
    ...(finding.alternatives ?? []),
  ];
  const selectedIndex = disposition?.alternativeIndex ?? -1;

  return (
    <div className="space-y-3 p-3">
      <PaneHeading
        title="What we suggest"
        hint={CHECKUP_KIND_VERBS[finding.kind]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {CHECKUP_KIND_LABELS[finding.kind]}
        </Badge>
      </div>

      {finding.kind === "remove" ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-foreground">
          We suggest retiring this rule. It stays in your Rulebook for history —
          audits that already cited it still work — but it stops being enforced.
        </div>
      ) : chosen ? (
        <RuleCard
          name={chosen.name}
          statement={chosen.statement}
          {...(chosen.rationale ? { rationale: chosen.rationale } : {})}
          {...(chosen.detection ? { detection: chosen.detection } : {})}
          severity={chosen.severity}
        />
      ) : null}

      {finding.reason.trim() ? (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Why we think so
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">
            {finding.reason}
          </p>
        </div>
      ) : null}

      <Evidence finding={finding} />

      {options.length > 1 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Pick the wording you want
          </div>
          <div className="space-y-1.5">
            {options.map((option, index) => {
              const optionIndex = index - 1; // -1 = the recommendation
              const active = selectedIndex === optionIndex;
              return (
                <button
                  key={`${option.name}-${index}`}
                  type="button"
                  onClick={() => onChoose(optionIndex)}
                  className={`w-full rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="font-medium text-foreground">
                    {index === 0 ? "Our pick: " : `Option ${index + 1}: `}
                  </span>
                  {option.statement}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <ConfidenceMeter confidence={finding.confidence} />

      {finding.kind !== "remove" && chosen ? (
        editing ? (
          <div className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Say it in your own words
            </div>
            <ProTextarea
              value={chosen.statement}
              onChange={(e) =>
                onEdit({ ...chosen, statement: e.target.value })
              }
              autoGrow
              minHeight={90}
              placeholder="Correct the rule so it says what you actually mean…"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Done editing
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => setEditing(true)}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Say it in your own words
          </Button>
        )
      ) : null}
    </div>
  );
}
