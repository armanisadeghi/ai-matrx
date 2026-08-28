// features/hr/compliance/LawPortalSurface.tsx
//
// ROUTE 85c — THE ORG LAW PORTAL (owner ruling D25, 2026-08-28):
// "our system sets the rules but then each organization needs to have their own law
// portal where they can see the laws and determine which ones apply to them… We set
// the rules, orgs override/add/edit for themselves."
//
// So this surface has exactly two halves and they are never blended:
//
//   1. THE PLATFORM BASELINE — read-only, here. An org cannot edit employment law,
//      and there is no control on this page that pretends otherwise. Promoting or
//      demoting a platform rule is a superadmin action in the admin portal (D25),
//      structurally enforced by a database trigger, so there is not even a door.
//   2. THE ORG'S OWN RULES — layered OVER that baseline, more generous only, with
//      the server as the judge. The refusal path lives in `OrgLawRuleEditor`.
//
// 🚨 THE JURISDICTION LIST IS DERIVED, NEVER TYPED. An employer's operating
// jurisdictions come from its work locations and establishments. When the list is
// empty the honest answer is to say where it comes from and open that door — not to
// show an empty box, and never to ask somebody to choose a jurisdiction here, which
// would create a second answer that can disagree with the locations.

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MapPin, Plus, Scale } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { fetchHrLawPortal, retireHrOrgLawRule } from "../service";
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
import { OrgLawRuleCard, PlatformLawRuleCard } from "./LawRuleCard";

type EditorTarget = { mode: "add" } | { mode: "edit"; rule: HrOrgLawRule } | null;

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

function groupByClass(
  rules: HrPlatformLawRule[],
): { label: string; slug: string; rules: HrPlatformLawRule[] }[] {
  const groups = new Map<string, { label: string; slug: string; rules: HrPlatformLawRule[] }>();
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

  const retire = async (rule: HrOrgLawRule) => {
    if (!organizationId) return;
    const confirmed = await confirm({
      title: `Retire your ${rule.rule_class_label.toLowerCase()} rule?`,
      description:
        "Retiring it returns you to the statutory baseline — the platform rules on this " +
        "page take over again from the moment you retire it. Nothing already computed " +
        "under it is rewritten.",
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
      <div className="space-y-6 p-4 sm:p-6">
        <OperatingJurisdictions portal={portal} names={names} orgRef={orgRef} />

        {/* ── The platform baseline ───────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">
              Laws that apply to you
            </h2>
            <Badge variant="neutral">
              {applying.reduce((total, group) => total + group.rules.length, 0)} rules
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              <Switch
                id="law-portal-show-all"
                checked={showAll}
                onCheckedChange={setShowAll}
              />
              <label
                htmlFor="law-portal-show-all"
                className="text-sm text-muted-foreground"
              >
                All US rules we track
              </label>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            We set these. They are read-only here — an organization decides how it
            complies, never what the law says.
          </p>

          {applying.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No platform rules resolve to your jurisdictions yet. That is normally
              because no work location carries a jurisdiction — the rules exist, but
              nothing tells us where you operate.
            </p>
          ) : (
            applying.map((group) => (
              <RuleClassGroup
                key={group.slug}
                label={group.label}
                rules={group.rules}
              />
            ))
          )}

          {showAll ? (
            <div className="space-y-3 border-t border-border pt-3">
              <h3 className="text-sm font-semibold text-muted-foreground">
                Everything else we track — none of this reaches you today
              </h3>
              {others.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing else. Every rule we hold already applies to you.
                </p>
              ) : (
                others.map((group) => (
                  <RuleClassGroup
                    key={group.slug}
                    label={group.label}
                    rules={group.rules}
                  />
                ))
              )}
            </div>
          ) : null}
        </section>

        {/* ── The org's own rung ──────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-semibold text-foreground">
              Your organization&apos;s rules
            </h2>
            <Badge variant="neutral">{portal?.org_rules.length ?? 0}</Badge>
            {!editor && organizationId && configurableClasses.length > 0 ? (
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                onClick={() => setEditor({ mode: "add" })}
              >
                <Plus className="mr-1 h-4 w-4" />
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
            <div className="rounded-md border border-dashed border-border p-4">
              <p className="text-sm text-foreground">
                You have not added any rules of your own.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                The platform sets the legal baseline. Rules you add here layer on top —
                more generous only — and never change the law itself.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(portal?.org_rules ?? []).map((rule) => (
                <OrgLawRuleCard
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
            <p className="text-sm text-muted-foreground">
              None of the rules we currently track can be configured by an organization.
            </p>
          ) : null}
        </section>

        {loading && portal ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Refreshing
          </p>
        ) : null}
      </div>
    </HrPageState>
  );
}

function RuleClassGroup({
  label,
  rules,
}: {
  label: string;
  rules: HrPlatformLawRule[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <span className="text-xs text-muted-foreground">{rules.length}</span>
      </div>
      <div className="space-y-2">
        {rules.map((rule) => (
          <PlatformLawRuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}

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

  return (
    <section className="rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">
          Where you operate
        </span>
        {keys.map((key) => (
          <Badge key={key} variant="secondary">
            {names.get(key) ?? key}
          </Badge>
        ))}
      </div>
      {keys.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          We do not know where you operate yet. Operating jurisdictions are derived from
          your work locations — every location carries one — so nothing here can be set
          by hand.{" "}
          <Link
            href={hrSettingsHref("structure", { org: orgRef })}
            className="underline underline-offset-2 hover:text-foreground"
          >
            Set them on your locations
          </Link>
          .
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Derived from your work locations, then expanded up each chain (city, county,
          state, federal) to find every rule that reaches you.
        </p>
      )}
    </section>
  );
}
