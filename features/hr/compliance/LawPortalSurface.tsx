// features/hr/compliance/LawPortalSurface.tsx
//
// ROUTE 85c — THE ORG LAW PORTAL (owner rulings D25 + D26, 2026-08-28).
//
// D25 gave the org a portal over the platform's employment-law baseline. D26 then
// overruled the posture that baseline BINDS unconditionally:
//
//   "by default, the rules would apply. However, if they choose to go there and
//    remove the meal period rule, we should not enforce it anymore."
//
// So this surface has three jobs and no fourth:
//
//   1. SHOW the platform baseline that reaches this employer, grouped by rule class,
//      one dense row per rule, collapsed.
//   2. LET THE ORG REMOVE ANY OF IT. Removal is real — the resolver stops enforcing
//      the rule — so it is LOUD (citation + one consequence sentence + an optional
//      reason) but never forbidden. A removed rule stays visible and marked, with a
//      one-click restore; hiding it would hide the org's own compliance exposure.
//   3. THE ORG'S OWN RULES, layered over the baseline, more generous only, with the
//      server as the judge. The refusal path lives in `OrgLawRuleEditor`.
//
// 🚨 THIS PAGE IS A DENSE INSTRUMENT, NOT AN ARTICLE (owner, 2026-08-28: "We need to
// have far fewer novels written in our user interface"). One short line where a
// paragraph used to be; a rule's `basis` prose is never on screen by default. New
// explanatory copy here is a regression, not an improvement.
//
// 🚨 THE JURISDICTION LIST IS DERIVED, NEVER TYPED. An employer's operating
// jurisdictions come from its work locations and establishments. When the list is
// empty the honest answer is to open that door — never to ask for a jurisdiction
// here, which would create a second answer that can disagree with the locations.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import {
  fetchHrLawPortal,
  retireHrOrgLawRule,
  setHrPlatformLawRuleApplies,
} from "../service";
import type {
  HrDenied,
  HrFailed,
  HrLawPortal,
  HrLawRuleClass,
  HrOrgLawRule,
  HrPlatformLawRule,
} from "../types";
import { hrSettingsHref } from "../routes";
import { HrPageState } from "../shared/HrStates";
import { useHrContext } from "../shared/useHrContext";
import { OrgLawRuleEditor, type LawJurisdictionOption } from "./OrgLawRuleEditor";
import { LawCitationLine, OrgLawRuleRow, PlatformLawRuleRow } from "./LawRuleRow";

type EditorTarget = { mode: "add" } | { mode: "edit"; rule: HrOrgLawRule } | null;

/** A rule's D26 identity: the decision is keyed by class × jurisdiction, never by id. */
function decisionKey(ruleClass: string, jurisdictionKey: string): string {
  return `${ruleClass}::${jurisdictionKey}`;
}

type RuleClassGroup = {
  slug: string;
  label: string;
  rules: HrPlatformLawRule[];
};

/** Key → name, from whatever the payload actually named. Never a hardcoded table. */
function jurisdictionNames(portal: HrLawPortal | null): Map<string, string> {
  const names = new Map<string, string>();
  if (!portal) return names;
  for (const rule of portal.platform_rules) {
    if (rule.jurisdiction_name) names.set(rule.jurisdiction_key, rule.jurisdiction_name);
  }
  for (const rule of portal.org_rules) {
    if (rule.jurisdiction_name) names.set(rule.jurisdiction_key, rule.jurisdiction_name);
  }
  return names;
}

function groupByClass(rules: HrPlatformLawRule[]): RuleClassGroup[] {
  const groups = new Map<string, RuleClassGroup>();
  for (const rule of rules) {
    const existing = groups.get(rule.rule_class);
    if (existing) existing.rules.push(rule);
    else
      groups.set(rule.rule_class, {
        slug: rule.rule_class,
        label: rule.rule_class_label,
        rules: [rule],
      });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function LawPortalSurface() {
  const { active, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [portal, setPortal] = useState<HrLawPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editor, setEditor] = useState<EditorTarget>(null);
  const [retiring, setRetiring] = useState<string | null>(null);
  /** The decision key currently in flight, so exactly one row shows a spinner. */
  const [deciding, setDeciding] = useState<string | null>(null);
  const [removing, setRemoving] = useState<HrPlatformLawRule | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    const result = await fetchHrLawPortal(organizationId);
    if (result.ok) {
      setPortal(result.data);
      setError(null);
    } else {
      setError(result);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const names = useMemo(() => jurisdictionNames(portal), [portal]);

  const applying = useMemo(
    () => groupByClass((portal?.platform_rules ?? []).filter((rule) => rule.applies_to_org)),
    [portal],
  );
  const others = useMemo(
    () => groupByClass((portal?.platform_rules ?? []).filter((rule) => !rule.applies_to_org)),
    [portal],
  );

  /** Which (class × jurisdiction) pairs this org has authored its own rule over. */
  const overridden = useMemo(() => {
    const keys = new Set<string>();
    for (const rule of portal?.org_rules ?? []) {
      keys.add(decisionKey(rule.rule_class, rule.jurisdiction_key));
    }
    return keys;
  }, [portal]);

  /** Only what an org may actually author. A class it may never touch is not offered. */
  const configurableClasses = useMemo<HrLawRuleClass[]>(
    () => (portal?.classes ?? []).filter((entry) => entry.org_configurable !== "no"),
    [portal],
  );

  const jurisdictionOptions = useMemo<LawJurisdictionOption[]>(() => {
    const keys = new Set<string>([
      ...(portal?.org_jurisdiction_keys ?? []),
      ...(portal?.chain_keys ?? []),
      "US",
    ]);
    return [...keys]
      .filter(Boolean)
      .map((key) => ({ key, name: names.get(key) ?? key }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [portal, names]);

  /**
   * D26 — apply or remove ONE platform rule for this org.
   *
   * The local patch is applied only AFTER the server granted, and it patches every
   * rule sharing the decision key, because the decision is class × jurisdiction.
   * A reload follows so `opt_outs` (who decided, when, why) stays the server's.
   */
  const setApplies = async (
    rule: HrPlatformLawRule,
    applies: boolean,
    reason: string | null,
  ) => {
    if (!organizationId) return false;
    const key = decisionKey(rule.rule_class, rule.jurisdiction_key);
    setDeciding(key);
    const result = await setHrPlatformLawRuleApplies({
      organizationId,
      ruleClass: rule.rule_class,
      jurisdictionKey: rule.jurisdiction_key,
      applies,
      reason,
    });
    setDeciding(null);

    if (!result.ok) {
      toast.error(
        result.kind === "denied"
          ? (result.detail ?? "That rule could not be changed.")
          : result.message,
      );
      return false;
    }

    const optedOut = result.data.decision === "opted_out";
    setPortal((current) =>
      current
        ? {
            ...current,
            platform_rules: current.platform_rules.map((entry) =>
              decisionKey(entry.rule_class, entry.jurisdiction_key) === key
                ? { ...entry, opted_out: optedOut }
                : entry,
            ),
          }
        : current,
    );
    toast.success(
      optedOut
        ? "Removed. The platform will not enforce this rule for your organization."
        : "Restored. The platform enforces this rule again.",
    );
    void load();
    return true;
  };

  const confirmRemoval = async () => {
    if (!removing) return;
    const done = await setApplies(removing, false, removeReason.trim() || null);
    if (done) {
      setRemoving(null);
      setRemoveReason("");
    }
  };

  const retire = async (rule: HrOrgLawRule) => {
    if (!organizationId) return;
    const confirmed = await confirm({
      title: `Retire your ${rule.rule_class_label.toLowerCase()} rule?`,
      description:
        "The platform rules on this page take over again from the moment you retire it. " +
        "Nothing already computed under it is rewritten.",
      confirmLabel: "Retire it",
    });
    if (!confirmed) return;

    setRetiring(rule.id);
    const result = await retireHrOrgLawRule({ organizationId, ruleId: rule.id });
    setRetiring(null);
    if (result.ok) {
      toast.success("Retired. You are back on the statutory baseline for this rule.");
      void load();
      return;
    }
    toast.error(
      result.kind === "denied"
        ? (result.detail ?? "That rule could not be retired.")
        : result.message,
    );
  };

  const appliedCount = applying.reduce(
    (total, group) => total + group.rules.filter((rule) => !rule.opted_out).length,
    0,
  );
  const removedCount = applying.reduce(
    (total, group) => total + group.rules.filter((rule) => rule.opted_out).length,
    0,
  );

  return (
    <HrPageState
      loading={loading && !portal}
      error={error?.kind === "failed" ? error : null}
      granted={error?.kind === "denied" ? false : undefined}
      operation="The law portal"
      onRetry={() => void load()}
      variant="panel"
      noAccessSentence="The employment-law rules for this employer are managed by whoever runs HR here."
    >
      <div className="space-y-4 p-3 sm:p-4">
        <OperatingJurisdictions portal={portal} names={names} orgRef={orgRef} />

        {/* ── The platform baseline ───────────────────────────────────────── */}
        <section className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Laws that apply to you</h2>
            <Badge variant="neutral">{appliedCount} enforced</Badge>
            {removedCount > 0 ? (
              <Badge variant="destructive">{removedCount} removed</Badge>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="law-portal-show-all" className="text-xs text-foreground">
                All US rules we track
              </label>
              <Switch
                id="law-portal-show-all"
                checked={showAll}
                onCheckedChange={setShowAll}
              />
            </div>
          </div>
          <p className="text-xs text-foreground">
            We set these. You decide which of them we enforce for you.
          </p>

          {applying.length === 0 ? (
            <p className="border-t border-border pt-2 text-xs text-foreground">
              No platform rules reach your jurisdictions yet — nothing tells us where you
              operate.
            </p>
          ) : (
            <div>
              {applying.map((group) => (
                <RuleClassSection
                  key={group.slug}
                  group={group}
                  overridden={overridden}
                  deciding={deciding}
                  onRemove={(rule) => {
                    setRemoveReason("");
                    setRemoving(rule);
                  }}
                  onRestore={(rule) => void setApplies(rule, true, null)}
                />
              ))}
            </div>
          )}

          {showAll ? (
            <div className="mt-2 border-t border-border pt-2">
              <h3 className="text-xs font-semibold text-foreground">
                Everything else we track — none of it reaches you today
              </h3>
              {others.length === 0 ? (
                <p className="text-xs text-foreground">
                  Nothing else. Every rule we hold already reaches you.
                </p>
              ) : (
                others.map((group) => (
                  <RuleClassSection key={group.slug} group={group} overridden={overridden} />
                ))
              )}
            </div>
          ) : null}
        </section>

        {/* ── The org's own rung ──────────────────────────────────────────── */}
        <section className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">
              Your organization&apos;s rules
            </h2>
            <Badge variant="neutral">{portal?.org_rules.length ?? 0}</Badge>
            {!editor && organizationId && configurableClasses.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className="ml-auto h-7"
                onClick={() => setEditor({ mode: "add" })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add a rule
              </Button>
            ) : null}
          </div>

          {editor && organizationId ? (
            <OrgLawRuleEditor
              organizationId={organizationId}
              classes={configurableClasses}
              jurisdictions={jurisdictionOptions}
              rule={editor.mode === "edit" ? editor.rule : null}
              onCancel={() => setEditor(null)}
              onSaved={() => {
                setEditor(null);
                void load();
              }}
            />
          ) : null}

          {(portal?.org_rules.length ?? 0) === 0 ? (
            <p className="border-t border-border pt-2 text-xs text-foreground">
              None yet. Rules you add layer over the baseline — more generous only.
            </p>
          ) : (
            <div className="border-t border-border">
              {(portal?.org_rules ?? []).map((rule) => (
                <OrgLawRuleRow
                  key={rule.id}
                  rule={rule}
                  busy={retiring === rule.id}
                  onEdit={() => setEditor({ mode: "edit", rule })}
                  onRetire={() => void retire(rule)}
                />
              ))}
            </div>
          )}

          {configurableClasses.length === 0 && portal ? (
            <p className="text-xs text-foreground">
              None of the rules we track today can be configured by an organization.
            </p>
          ) : null}
        </section>

        {loading && portal ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Refreshing
          </p>
        ) : null}
      </div>

      {/* ── D26 removal: loud, short, and never a wall of text ───────────── */}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoving(null);
            setRemoveReason("");
          }
        }}
        variant="destructive"
        title={
          removing
            ? `Remove ${removing.rule_class_label} — ${removing.jurisdiction_name ?? removing.jurisdiction_key}?`
            : "Remove this rule?"
        }
        description="Removing this stops the platform from enforcing it for your organization. Compliance with this law becomes your team's responsibility."
        content={
          removing ? (
            <div className="space-y-2">
              <LawCitationLine citation={removing.citation} />
              <Input
                aria-label="Why are you removing this rule?"
                placeholder="Why (optional)"
                value={removeReason}
                onChange={(event) => setRemoveReason(event.target.value)}
              />
            </div>
          ) : null
        }
        confirmLabel="Remove it"
        busy={deciding !== null}
        onConfirm={() => void confirmRemoval()}
      />
    </HrPageState>
  );
}

/**
 * ONE rule class, as a simple collapsible section.
 *
 * 🚨 NO CARD, NO SECOND BORDER, NO NESTED PANEL. The header is a row, the body is
 * rows. Layering a card around a list of rows is exactly what the owner rejected.
 *
 * `onRemove`/`onRestore` are absent for the "everything else we track" list, where a
 * removal decision would be meaningless — a rule that does not reach the org is not
 * being enforced in the first place.
 */
function RuleClassSection({
  group,
  overridden,
  deciding,
  onRemove,
  onRestore,
}: {
  group: RuleClassGroup;
  overridden: Set<string>;
  deciding?: string | null;
  onRemove?: (rule: HrPlatformLawRule) => void;
  onRestore?: (rule: HrPlatformLawRule) => void;
}) {
  const [open, setOpen] = useState(true);

  const removed = group.rules.filter((rule) => rule.opted_out).length;
  const overrides = group.rules.filter((rule) =>
    overridden.has(decisionKey(rule.rule_class, rule.jurisdiction_key)),
  ).length;
  const applied = group.rules.length - removed;

  return (
    <section className="border-t border-border first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-foreground" />
        )}
        <span className="truncate text-sm font-semibold text-foreground">{group.label}</span>
        <span className="text-xs text-foreground">{group.rules.length}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-foreground">
          <span>{applied} applies</span>
          {removed > 0 ? (
            <span className="font-semibold text-destructive">{removed} removed</span>
          ) : null}
          {overrides > 0 ? <span>{overrides} overridden</span> : null}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border">
          {group.rules.map((rule) => (
            <PlatformLawRuleRow
              key={rule.id}
              rule={rule}
              control={
                onRemove && onRestore ? (
                  <AppliesControl
                    rule={rule}
                    busy={
                      deciding === decisionKey(rule.rule_class, rule.jurisdiction_key)
                    }
                    onRemove={() => onRemove(rule)}
                    onRestore={() => onRestore(rule)}
                  />
                ) : undefined
              }
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * THE D26 CONTROL — one per rule row, on the same line as its status.
 *
 * Off is removal and opens the confirm dialog. On is restore and needs no dialog:
 * it returns the org to the safe default, which is never the dangerous direction.
 */
function AppliesControl({
  rule,
  busy,
  onRemove,
  onRestore,
}: {
  rule: HrPlatformLawRule;
  busy: boolean;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const id = `applies-${rule.rule_class}-${rule.jurisdiction_key}`;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" /> : null}
      <label htmlFor={id} className="text-xs font-medium text-foreground">
        {rule.opted_out ? "Restore" : "Applies"}
      </label>
      <Switch
        id={id}
        checked={!rule.opted_out}
        disabled={busy}
        aria-label={`${rule.rule_class_label} in ${rule.jurisdiction_name ?? rule.jurisdiction_key} applies to your organization`}
        onCheckedChange={(next) => (next ? onRestore() : onRemove())}
      />
    </div>
  );
}

/** Where the employer operates — one line, derived, never typed. */
function OperatingJurisdictions({
  portal,
  names,
  orgRef,
}: {
  portal: HrLawPortal | null;
  names: Map<string, string>;
  orgRef: string | null;
}) {
  const keys = portal?.org_jurisdiction_keys ?? [];

  if (keys.length === 0) {
    return (
      <p className="text-xs text-foreground">
        We do not know where you operate — jurisdictions come from your work locations.{" "}
        <Link
          href={hrSettingsHref("structure", { org: orgRef })}
          className="underline underline-offset-2"
        >
          Set them on your locations
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-foreground">You operate in</span>
      {keys.map((key) => (
        <Badge key={key} variant="secondary">
          {names.get(key) ?? key}
        </Badge>
      ))}
    </div>
  );
}
