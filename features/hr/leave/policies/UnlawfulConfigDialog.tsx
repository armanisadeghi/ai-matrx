/**
 * features/hr/leave/policies/UnlawfulConfigDialog.tsx — SPEC-LEAVE §2.6, the unlawful-config
 * REJECTION UX.
 *
 * This is the highest-value surface in the leave lane, and every one of its rules exists
 * because the obvious implementation gets it wrong:
 *
 *  1. **A BLOCKING DIALOG, NEVER A TOAST AND NEVER AN INLINE HINT.** A toast disappears; an
 *     inline hint is read after the fact. The write did not happen, and the admin has to know
 *     that before they walk away.
 *  2. **TITLED WITH THE JURISDICTION.** "This policy is not lawful in California" — the name
 *     of the place, not "Validation failed".
 *  3. **THE `message` IS PRINTED VERBATIM.** It is written for an HR administrator by
 *     `hr.validate_org_config` and it already names the lawful alternative. This component
 *     re-words nothing, truncates nothing, and never substitutes a `code`.
 *  4. **"This affects N employees in <jurisdiction>"** — and ONLY when the server actually sent
 *     a count. `affected_employees` is absent on several branches, and "affects 0 employees"
 *     under a refusal reads as "nobody cares", which is the opposite of what a compliance
 *     dialog is for.
 *  5. **A "Why?" DISCLOSURE** that expands to the rule id, its version, and the citation's
 *     authority and URL AS A REAL LINK.
 *  6. **THE VIOLATION'S OWN `fix` IS THE PRIMARY ACTION.** `hr.leave_policy_validate` composes
 *     one per violation code. §2.6: *"a dialog whose only button is 'OK' is a defect."*
 *  7. **THE ADMIN'S REJECTED INPUT STAYS IN THE FORM.** This dialog never clears it and never
 *     applies it. Taking a fix merges only the keys the engine named.
 *  8. **WARNINGS ARE NOT VIOLATIONS.** They render under their own "Things to be aware of"
 *     heading with **Save anyway**, because an advisory rule may never block a customer's
 *     configuration.
 *
 * 🚨 AND THE ONE CASE THE SPEC DOES NOT COVER, HANDLED HONESTLY.
 * `hr.leave_policy_save` catches sqlstate 23514 — a `hr.leave_policy` CHECK constraint — and
 * returns it under the SAME `unlawful_configuration` reason, with `detail` set to the raw
 * `sqlerrm` and an EMPTY violations list. That is a product constraint, not a law, and there is
 * no jurisdiction to name. When that happens this dialog says so in words and shows the
 * technical reference as a reference, rather than inventing a jurisdiction or printing a
 * Postgres sentence as if a legislature had written it. (`policy-form.ts` catches all of them
 * at the control first, so this is the belt to that braces.)
 */

"use client";

import { useState } from "react";
import { AlertTriangle, ExternalLink, Info, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type {
  LeaveConfigViolation,
  LeaveSaveRefusal,
} from "../manager/api/types";

/** The jurisdictions named by a set of findings, in the order they were returned. */
function jurisdictionsOf(findings: LeaveConfigViolation[]): string[] {
  const seen: string[] = [];
  for (const finding of findings) {
    const name = finding.jurisdictionName ?? finding.jurisdictionKey;
    if (name && !seen.includes(name)) seen.push(name);
  }
  return seen;
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Evidence, printed as data. Never turned into a sentence — the sentence is `message`. */
function EvidenceValue({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  const text =
    typeof value === "string" || typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value);
  return (
    <div className="flex min-w-0 gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-mono text-foreground">{text}</span>
    </div>
  );
}

/**
 * The "Why?" disclosure. Every field is rendered only if it arrived — an absent `rule_version`
 * is absent, never "v1".
 */
function WhyDisclosure({ finding }: { finding: LeaveConfigViolation }) {
  const [open, setOpen] = useState(false);
  const citation = finding.citation;
  const hasAnything =
    finding.ruleId ||
    finding.ruleVersion ||
    citation ||
    finding.boundBasis ||
    finding.configured !== null ||
    finding.required !== null;

  if (!hasAnything) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
          <Info className="mr-1.5 h-3.5 w-3.5" />
          {open ? "Hide the rule" : "Why?"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1.5 rounded-md border border-border bg-muted/40 p-3 text-xs">
        {finding.ruleId ? <EvidenceValue label="Rule" value={finding.ruleId} /> : null}
        {finding.ruleVersion ? (
          <EvidenceValue label="Version" value={finding.ruleVersion} />
        ) : null}
        {finding.ruleClass ? <EvidenceValue label="Class" value={finding.ruleClass} /> : null}
        {finding.boundBasis ? (
          <EvidenceValue label="Basis" value={finding.boundBasis} />
        ) : null}
        <EvidenceValue label="Your setting" value={finding.configured} />
        <EvidenceValue label="Required" value={finding.required} />

        {citation ? (
          <div className="space-y-1 border-t border-border pt-2">
            {citation.authority ? (
              <EvidenceValue label="Authority" value={citation.authority} />
            ) : null}
            {citation.title ? <EvidenceValue label="Source" value={citation.title} /> : null}
            {/*
              🚨 A REAL LINK, per §2.6. `citation.url` is authored data and may be an internal
              path or an external legal source, so it is rendered exactly as stored and opened
              in a new tab — the admin never loses the form they are in the middle of.
            */}
            {citation.url ? (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                Open the source
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
            {/*
              Live rows carry `confidence: 'unverified'` alongside an authority that says so in
              as many words. An admin being refused is entitled to know which kind of rule is
              refusing them.
            */}
            {citation.confidence ? (
              <div className="pt-1">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {citation.confidence.replace(/_/g, " ")}
                </Badge>
              </div>
            ) : null}
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function FindingBlock({
  finding,
  tone,
  onTakeFix,
  busy,
}: {
  finding: LeaveConfigViolation;
  tone: "violation" | "warning";
  onTakeFix?: (finding: LeaveConfigViolation) => void;
  busy: boolean;
}) {
  const place = finding.jurisdictionName ?? finding.jurisdictionKey;
  const count = finding.affectedEmployees;

  return (
    <div
      className={
        tone === "violation"
          ? "space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
          : "space-y-2 rounded-lg border border-border bg-card p-3"
      }
    >
      {place ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {place}
        </p>
      ) : null}

      {/* VERBATIM. The validator wrote this for an HR administrator. */}
      <p className="text-sm leading-relaxed text-foreground">
        {finding.message ??
          "The lawfulness check refused this configuration and did not say why, which is itself a defect."}
      </p>

      {typeof count === "number" ? (
        <p className="text-sm font-medium text-foreground">
          This affects {count} {count === 1 ? "employee" : "employees"}
          {place ? ` in ${place}` : ""}.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {onTakeFix && finding.fix?.label ? (
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onTakeFix(finding)}
            className="min-h-11 sm:min-h-9"
          >
            {finding.fix.label}
          </Button>
        ) : null}
        <WhyDisclosure finding={finding} />
      </div>
    </div>
  );
}

export interface UnlawfulConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refusal: LeaveSaveRefusal | null;
  /** Merge this violation's `fix.set` into the form and focus `fix.focus_field`. */
  onTakeFix: (finding: LeaveConfigViolation) => void;
  /** Re-call `hr_leave_policy_save` with `p_accept_warnings = true`. Warnings branch only. */
  onSaveAnyway: () => void;
  busy?: boolean;
}

export function UnlawfulConfigDialog({
  open,
  onOpenChange,
  refusal,
  onTakeFix,
  onSaveAnyway,
  busy = false,
}: UnlawfulConfigDialogProps) {
  if (!refusal) return null;

  const violations = refusal.validation?.violations ?? [];
  const warnings = refusal.validation?.warnings ?? [];
  const places = jurisdictionsOf(violations.length > 0 ? violations : warnings);

  const isOwnerGate = refusal.reason === "accrual_method_change_requires_owner";
  const isWarningsOnly = refusal.reason === "warnings_unacknowledged";
  /**
   * The CHECK-constraint case: refused as `unlawful_configuration` with nothing to show.
   * Named honestly rather than dressed up as a jurisdiction refusal.
   */
  const isProductConstraint =
    refusal.reason === "unlawful_configuration" && violations.length === 0;

  const title = (() => {
    if (isOwnerGate) return "Changing how an active policy earns time needs an owner";
    if (isWarningsOnly) return "Before this is saved";
    if (isProductConstraint) return "This policy cannot be saved as configured";
    if (places.length > 0) return `This policy is not lawful in ${joinNames(places)}`;
    return "This policy is not lawful as configured";
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        // BLOCKING (§2.6): the write did not happen, and a stray click outside must not make
        // that fact disappear. The close control and "Back to the form" are the ways out, and
        // both land the admin back on their own untouched input.
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2">
            {isWarningsOnly ? (
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            )}
            <span className="min-w-0">{title}</span>
          </DialogTitle>
          <DialogDescription>
            {isWarningsOnly
              ? "Nothing has been saved yet. Read these, then save anyway or go back and change the policy."
              : "Nothing was saved and nothing in your form was changed."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {isOwnerGate ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm leading-relaxed text-foreground">
                {refusal.detail ??
                  "Changing how an active policy earns time is an owner decision."}
              </p>
              {typeof refusal.affectedEnrollments === "number" ? (
                <p className="text-sm font-medium text-foreground">
                  {refusal.affectedEnrollments}{" "}
                  {refusal.affectedEnrollments === 1 ? "person is" : "people are"} enrolled in
                  this policy today.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Past ledger entries are never touched either way — the runner uses the version
                in force at each accrual date.
              </p>
            </div>
          ) : null}

          {isProductConstraint ? (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm leading-relaxed text-foreground">
                One of this policy&rsquo;s own settings contradicts another, so the database
                refused it. No jurisdiction is involved. Go back and check the accrual rate, the
                caps, and the rounding increment.
              </p>
              {refusal.detail ? (
                <p className="font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
                  Technical reference: {refusal.detail}
                </p>
              ) : null}
            </div>
          ) : null}

          {violations.map((finding, index) => (
            <FindingBlock
              key={`${finding.code ?? "violation"}-${finding.jurisdictionKey ?? index}`}
              finding={finding}
              tone="violation"
              onTakeFix={onTakeFix}
              busy={busy}
            />
          ))}

          {warnings.length > 0 ? (
            <div className="space-y-2 pt-1">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                Things to be aware of
              </h3>
              <p className="text-xs text-muted-foreground">
                These come from rules we have not yet verified. They never block a
                configuration.
              </p>
              {warnings.map((finding, index) => (
                <FindingBlock
                  key={`${finding.code ?? "warning"}-${finding.jurisdictionKey ?? index}`}
                  finding={finding}
                  tone="warning"
                  busy={busy}
                />
              ))}
            </div>
          ) : null}

          {/*
            What was actually checked. A refusal states its own scope — an admin who is told
            "not lawful" is entitled to know which places were consulted.
          */}
          {refusal.validation?.jurisdictionsChecked.length ? (
            <p className="text-xs text-muted-foreground">
              Checked against {joinNames(refusal.validation.jurisdictionsChecked)}.
            </p>
          ) : null}
          {refusal.validation?.checked === false && refusal.validation.detail ? (
            <p className="text-xs text-muted-foreground">{refusal.validation.detail}</p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="min-h-11 sm:min-h-9"
          >
            Back to the form
          </Button>
          {/*
            SAVE ANYWAY exists only on the warnings branch, where the server itself said
            `save_anyway: true`. It is ABSENT — not disabled — on a real violation, because
            there is no "anyway" for an unlawful configuration.
          */}
          {isWarningsOnly && refusal.saveAnyway ? (
            <Button
              type="button"
              disabled={busy}
              onClick={onSaveAnyway}
              className="min-h-11 sm:min-h-9"
            >
              Save anyway
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
