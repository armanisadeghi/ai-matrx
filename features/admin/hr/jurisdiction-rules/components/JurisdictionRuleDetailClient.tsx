// features/admin/hr/jurisdiction-rules/components/JurisdictionRuleDetailClient.tsx
//
// /administration/hr/jurisdiction-rules/[ruleId] (SPEC-UI-IA §3.12 route 85a) —
// the rule detail and THE PROMOTE/DEMOTE CONTROL.
//
// 🚨 D25 (2026-08-28, owner ruling): only a superadmin, and only from the admin
// portal, may promote an employment-law rule to `active`. The database enforces
// that (hr.jurisdiction_rule_set_status + the authority-gate trigger); this
// surface's job is to put THE SOURCE IN FRONT OF THE PERSON SIGNING. The
// promotion dialog therefore renders the citation and the basis as they stand
// at the moment of promotion, requires a sign-off note, and says plainly when
// the rule cites our own research rather than an external authority.
//
// v1 does not edit rule content. Parameters are read-only: a change to what a
// rule SAYS arrives as a new version through the amendment flow (§4.3), never
// as an in-place edit of a live rule.

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  ExternalLink,
  FlaskConical,
  History,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/textarea";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { setJurisdictionRuleStatus } from "../service";
import { useJurisdictionRulesAdminData } from "../useJurisdictionRulesAdminData";
import {
  allowedTransitionsFrom,
  type JurisdictionRule,
  type JurisdictionRuleStatus,
} from "../types";
import {
  PendingVerificationFlag,
  RuleLoadGate,
  externalCitationUrl,
  RuleStatusBadge,
  SeedTaskChip,
  formatDateRange,
} from "./rule-chrome";

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card">
      <h2 className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </h2>
      <div className="p-3 text-sm">{children}</div>
    </section>
  );
}

function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <pre className="max-h-80 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-xs leading-relaxed text-foreground">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2 py-0.5 text-sm">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

/**
 * The block D25 requires on screen at the moment of promotion — the citation
 * and the basis, verbatim, plus the two loud warnings.
 */
function CitationAtSignoff({ rule }: { rule: JurisdictionRule }) {
  const citation = rule.citation;
  const sourceUrl = externalCitationUrl(citation?.url);
  const noSource = sourceUrl === null;
  return (
    <div className="space-y-2 text-left">
      <div className="rounded-md border border-border bg-muted/40 p-2 text-sm">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Citation
        </div>
        <Field label="Authority">{citation?.authority ?? "—"}</Field>
        {citation?.title ? <Field label="Title">{citation.title}</Field> : null}
        <Field label="Source">
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 break-all text-primary hover:underline"
            >
              {sourceUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="break-all text-muted-foreground">
              {citation?.url ?? "none recorded"}
            </span>
          )}
        </Field>
        <Field label="Retrieved">{citation?.retrieved_at ?? "—"}</Field>
        <Field label="Verified">
          {citation?.verified_by
            ? `${citation.verified_by}${citation.verified_at ? ` · ${citation.verified_at}` : ""}`
            : "—"}
        </Field>
        {citation?.confidence ? (
          <Field label="Confidence">{citation.confidence}</Field>
        ) : null}
        <Field label="Basis">{rule.basis ?? "—"}</Field>
      </div>

      {noSource ? (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          This rule cites our own research, not an external authority
          {citation?.url ? ` (${citation.url})` : ""}. There is no external
          source to check it against.
        </p>
      ) : null}

      {rule.unverified_keys.length > 0 ? (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {rule.unverified_keys.length} parameter
          {rule.unverified_keys.length === 1 ? "" : "s"} are still unverified (
          {rule.unverified_keys.join(", ")})
          {rule.produces_money
            ? " — and this class produces money, so promoting it makes an unverified number payable."
            : "."}
        </p>
      ) : null}
    </div>
  );
}

export function JurisdictionRuleDetailClient({ ruleId }: { ruleId: string }) {
  const { load, loading, reload } = useJurisdictionRulesAdminData();
  const [pendingStatus, setPendingStatus] =
    useState<JurisdictionRuleStatus | null>(null);
  const [signOff, setSignOff] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{
    reason: string;
    detail: string | null;
  } | null>(null);

  const gate = (
    <RuleLoadGate load={load} loading={loading} loadingLabel="Loading the rule…" />
  );
  if (!load || load.state !== "ok") return gate;

  const rule = load.data.rules.find((candidate) => candidate.id === ruleId);
  if (!rule) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No rule with this id is in the library.{" "}
        <Link
          href="/administration/hr/jurisdiction-rules"
          className="text-primary hover:underline"
        >
          Back to the rule library
        </Link>
        .
      </div>
    );
  }

  const ruleClass = load.data.classes.find(
    (candidate) => candidate.slug === rule.rule_class,
  );
  const transitions = allowedTransitionsFrom(rule.status);
  const promoting = pendingStatus === "active";
  const demoting = rule.status === "active" && pendingStatus === "advisory";

  const runTransition = async () => {
    if (!pendingStatus) return;
    setBusy(true);
    setRefusal(null);
    const result = await setJurisdictionRuleStatus(
      rule.id,
      pendingStatus,
      signOff.trim(),
    );
    setBusy(false);
    if (result.state === "ok") {
      toast.success(
        `${rule.rule_class_label} · ${rule.jurisdiction_key} is now ${result.status}.`,
      );
      setPendingStatus(null);
      setSignOff("");
      reload();
      return;
    }
    setPendingStatus(null);
    if (result.state === "refused") {
      setRefusal({ reason: result.reason, detail: result.detail });
      return;
    }
    setRefusal({ reason: "failed", detail: result.technical ?? result.message });
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href="/administration/hr/jurisdiction-rules"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            Rule library
          </Link>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold">
            {rule.rule_class_label}
            <span className="text-muted-foreground">·</span>
            <span>{rule.jurisdiction_name ?? rule.jurisdiction_key}</span>
            <span className="font-mono text-sm text-muted-foreground">
              {rule.jurisdiction_key}
            </span>
            <RuleStatusBadge status={rule.status} />
            <span className="text-xs text-muted-foreground">
              v{rule.version ?? "—"}
            </span>
            <SeedTaskChip task={rule.jur_seed_task} />
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{formatDateRange(rule.effective_from, rule.effective_to)}</span>
            <span>· {rule.source_scope ?? "—"}</span>
            {rule.produces_money ? <span>· produces money</span> : null}
            {rule.verification_due ? (
              <span>· verify by {rule.verification_due}</span>
            ) : null}
            <PendingVerificationFlag
              unverifiedKeys={rule.unverified_keys}
              producesMoney={rule.produces_money}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {transitions.map((target) => (
            <Button
              key={target}
              size="sm"
              variant={
                target === "active"
                  ? "default"
                  : rule.status === "active"
                    ? "destructive"
                    : "outline"
              }
              onClick={() => {
                setRefusal(null);
                setSignOff("");
                setPendingStatus(target);
              }}
            >
              {target === "active" ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              {target === "active"
                ? "Promote to active"
                : rule.status === "active" && target === "advisory"
                  ? "Demote to advisory"
                  : `Move to ${target}`}
            </Button>
          ))}
          {transitions.length === 0 ? (
            <span className="text-xs text-muted-foreground">
              No status change is available from {rule.status}.
            </span>
          ) : null}
        </div>
      </div>

      {/* The `not_found` label deliberately does NOT claim the rule is absent:
          the operator is looking at it on this very page, so the door refusing
          the write can only mean the write never reached it — its own scope, a
          stale id, a lapsed session. Naming a cause we cannot know is the guess
          `features/access-gate/` exists to kill. */}
      {refusal ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {refusal.reason === "promotion_blocked"
              ? "Promotion blocked by the fixture gate"
              : refusal.reason === "not_superadmin"
                ? "Superadmin only"
                : refusal.reason === "reason_required"
                  ? "A sign-off note is required"
                  : refusal.reason === "transition_not_allowed"
                    ? "That transition is not supported"
                    : refusal.reason === "not_a_platform_rule"
                      ? "Not a platform rule"
                      : refusal.reason === "not_found"
                        ? "We couldn't reach that rule"
                        : "The status change did not go through"}
          </div>
          {refusal.detail ? (
            <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {refusal.detail}
            </pre>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Citation" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
          <Field label="Authority">{rule.citation?.authority ?? "—"}</Field>
          <Field label="Title">{rule.citation?.title ?? "—"}</Field>
          <Field label="URL">
            {externalCitationUrl(rule.citation?.url) ? (
              <a
                href={externalCitationUrl(rule.citation?.url) ?? undefined}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 break-all text-primary hover:underline"
              >
                {rule.citation?.url}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ) : (
              <span className="break-all text-amber-700 dark:text-amber-400">
                {rule.citation?.url
                  ? `${rule.citation.url} — our own research, not an external authority`
                  : "none — this rule cites our own research"}
              </span>
            )}
          </Field>
          <Field label="Retrieved at">{rule.citation?.retrieved_at ?? "—"}</Field>
          <Field label="Verified by">{rule.citation?.verified_by ?? "—"}</Field>
          <Field label="Verified at">{rule.citation?.verified_at ?? "—"}</Field>
          <Field label="Confidence">{rule.citation?.confidence ?? "—"}</Field>
          <Field label="Basis">{rule.basis ?? "—"}</Field>
          <Field label="Verification due">
            {rule.verification_due ?? "—"}
          </Field>
        </Section>

        <Section title="Class">
          <Field label="Class">
            {rule.rule_class_label}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              {rule.rule_class}
            </span>
          </Field>
          <Field label="Produces money">
            {rule.produces_money ? "yes" : "no"}
          </Field>
          <Field label="Precedence">{ruleClass?.precedence_mode ?? "—"}</Field>
          <Field label="Org configurable">
            {ruleClass?.org_configurable ?? "—"}
          </Field>
          <Field label="Absence means">
            {ruleClass?.absence_semantics ?? "—"}
          </Field>
          <Field label="Organization">
            {rule.organization_id ? (
              <EntityRef
                token="organization"
                id={rule.organization_id}
                openInNewTab
              />
            ) : (
              "Platform baseline"
            )}
          </Field>
          {ruleClass?.description ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {ruleClass.description}
            </p>
          ) : null}
        </Section>

        <Section title="Parameters">
          <p className="mb-1.5 text-xs text-muted-foreground">
            Read-only. A change to what this rule says arrives as a NEW version
            through the amendment flow, never as an edit here.
          </p>
          <Json value={rule.parameters} />
        </Section>

        <Section title="Applicability">
          <Json value={rule.applicability} />
        </Section>

        <Section
          title="Fixtures"
          icon={<FlaskConical className="h-3.5 w-3.5" />}
        >
          {rule.fixtures.length === 0 ? (
            <p className="text-muted-foreground">
              No fixtures cover this rule.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rule.fixtures.map((fixture) => (
                <li
                  key={`${fixture.code}-${fixture.pinned}`}
                  className="flex items-baseline gap-2 py-1 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {fixture.code}
                  </span>
                  <span className="min-w-0 flex-1">
                    {fixture.title ?? "—"}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      fixture.expected_status === "pending_verification"
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground",
                    )}
                  >
                    {fixture.expected_status ?? "—"}
                  </span>
                  {fixture.pinned ? (
                    <span className="text-[11px] text-muted-foreground">
                      pinned
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Status history" icon={<History className="h-3.5 w-3.5" />}>
          {rule.status_history.length === 0 ? (
            <p className="text-muted-foreground">
              No recorded status changes. This rule is where it was seeded.
            </p>
          ) : (
            <ol className="space-y-2">
              {[...rule.status_history].reverse().map((entry, index) => (
                <li
                  key={`${entry.at ?? index}-${index}`}
                  className="border-l-2 border-border pl-2.5"
                >
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">
                      {entry.at ?? "—"}
                    </span>
                    <RuleStatusBadge status={entry.from ?? "—"} />
                    <span className="text-muted-foreground">→</span>
                    <RuleStatusBadge status={entry.to ?? "—"} />
                  </div>
                  {entry.reason ? (
                    <p className="mt-0.5 text-sm">{entry.reason}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">
                    by {entry.by ?? "unknown"}
                    {entry.citation_at_change?.authority
                      ? ` · cited ${entry.citation_at_change.authority}`
                      : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section title="Lineage">
          <Field label="Supersedes">
            {rule.supersedes_id ? (
              <Link
                href={`/administration/hr/jurisdiction-rules/${rule.supersedes_id}`}
                className="font-mono text-xs text-primary hover:underline"
              >
                {rule.supersedes_id}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Correction of">
            {rule.correction_of_id ? (
              <Link
                href={`/administration/hr/jurisdiction-rules/${rule.correction_of_id}`}
                className="font-mono text-xs text-primary hover:underline"
              >
                {rule.correction_of_id}
              </Link>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Rule id">
            <span className="font-mono text-xs">{rule.id}</span>
          </Field>
        </Section>
      </div>

      <ConfirmDialog
        open={pendingStatus !== null}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPendingStatus(null);
            setSignOff("");
          }
        }}
        title={
          promoting
            ? "Promote this rule to active"
            : demoting
              ? "Demote this rule to advisory"
              : `Move this rule to ${pendingStatus ?? ""}`
        }
        description={
          promoting
            ? "Active means binding: engines will calculate on these parameters. Read the citation below before you sign."
            : demoting
              ? "Binding calculations on this rule will drop to flags. Anything that was being computed from it will only be warned about."
              : "This changes where the rule sits on the status ladder."
        }
        contentClassName="max-w-2xl"
        content={
          <div className="space-y-2">
            {promoting ? <CitationAtSignoff rule={rule} /> : null}
            {demoting ? (
              <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-sm text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {rule.rule_class_label} in{" "}
                {rule.jurisdiction_name ?? rule.jurisdiction_key} stops binding
                the moment you confirm.
                {rule.produces_money
                  ? " This class produces money: amounts computed from it become flags instead of figures."
                  : ""}
              </p>
            ) : null}
            <label className="block text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Sign-off note{promoting ? " (required)" : ""}
              </span>
              <Textarea
                value={signOff}
                onChange={(event) => setSignOff(event.target.value)}
                rows={3}
                placeholder={
                  promoting
                    ? "What you checked, and against what source."
                    : "Why this rule is moving."
                }
                className="mt-1"
              />
            </label>
          </div>
        }
        confirmLabel={
          promoting ? "Promote to active" : `Move to ${pendingStatus ?? ""}`
        }
        variant={promoting ? "default" : "destructive"}
        busy={busy}
        confirmDisabled={promoting && signOff.trim().length === 0}
        onConfirm={runTransition}
      />
    </div>
  );
}
