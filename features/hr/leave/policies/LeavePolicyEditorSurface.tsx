/**
 * features/hr/leave/policies/LeavePolicyEditorSurface.tsx — SPEC-LEAVE §2, UI-IA route 74a.
 *
 * The policy editor. §2.3's accrual-method matrix decides which controls exist (in
 * `policy-form.ts`, as data); §2.6's rejection dialog is `UnlawfulConfigDialog`; this file is
 * the form, the client twin, and the save path.
 *
 * ── WHAT THIS SURFACE PROMISES ──────────────────────────────────────────────
 *  • The two waiting periods can never be confused: `waiting_period_days` delays EARNING,
 *    `usable_after_days` delays SPENDING, they are labelled in those words, they sit in
 *    different sections, and each carries the sentence that separates them.
 *  • `unlimited` HIDES every cap, carryover, negative-balance and payout control, and the save
 *    payload actively CLEARS those columns rather than leaving stale numbers behind a hidden
 *    control.
 *  • The client twin (`hr_leave_policy_validate`) runs on blur of a governed field, so a
 *    problem is seen at the control rather than discovered at save.
 *  • A save refusal opens the blocking dialog and the admin's input is neither cleared nor
 *    rewritten.
 *
 * ── 🚨 WHAT COULD NOT BE BUILT, AND WHY IT IS NOT FAKED ─────────────────────
 *  1. **§2.5's statutory floor cards.** They need the RESOLVED rule for each operating
 *     jurisdiction — its value, status, effective range and citation — which comes from
 *     `hr.resolve_rules`. There is no `public.hr_*` door to it (verified against the full
 *     `public` HR function list, 2026-08-27), so this client cannot know what the floor IS.
 *     A field cannot therefore be rendered "locked at the floor" with its statutory value, and
 *     inventing a value would be worse than not showing one. What IS built from what the
 *     validator actually returns: which jurisdictions were checked, whether any consulted rule
 *     is unverified (§2.5's amber banner), and every violation with its own citation.
 *  2. **§2.4's statutory `mandated_uses`, checked-and-disabled.** Same missing door: the
 *     statutory `permitted_uses` are not reachable, so this editor cannot tell a use the law
 *     requires from one the org added. It therefore removes the REMOVE control entirely on a
 *     policy that carries a statutory basis, and says so — the conservative direction, since
 *     §2.4's rule is that an org may add a use and never remove one.
 *  3. **§2.7's `pay_out` and `migrate_to` deactivation dispositions.** `hr_leave_policy_save`
 *     takes no disposition and writes no ledger entries for one. Deactivating here is exactly
 *     the `freeze` disposition — accrual stops, the balance stays spendable — and the copy
 *     says that rather than offering three choices where the door honours one.
 *  4. **`requires_approval` and `statutory_jurisdiction_id`.** Accepted by the save door,
 *     never returned by the list door — see `manager/api/types.ts`.
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { hrSettingsHref } from "@/features/hr/routes";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import { useHrSettingsStructure } from "@/features/hr/settings/hooks/useHrSettingsStructure";
import { HrSettingsShell } from "@/features/hr/settings/HrSettingsShell";
import { HR_WORKER_CLASSES } from "@/features/hr/constants";
import { isHrDenied } from "@/features/hr/types";
import type { HrDenied, HrFailed } from "@/features/hr/types";

import {
  fetchLeavePolicies,
  leaveSaveRefusal,
  saveLeavePolicy,
  validateLeavePolicy,
} from "../manager/api/service";
import type {
  LeaveConfigViolation,
  LeavePolicy,
  LeavePolicyBlackout,
  LeavePolicyList,
  LeavePolicyValidation,
  LeaveSaveRefusal,
} from "../manager/api/types";
import {
  LEAVE_POLICY_NEW,
  leavePolicyEnrollmentHref,
  leavePolicyHref,
} from "../manager/routes";
import { UnlawfulConfigDialog } from "./UnlawfulConfigDialog";
import {
  ACCRUAL_METHOD_HELP,
  ACCRUAL_METHOD_LABEL,
  ACCRUAL_STARTS,
  ACCRUAL_STARTS_LABEL,
  applyLeaveFix,
  checkConstraintProblems,
  emptyLeavePolicyForm,
  FIELD_HELP,
  FIELD_LABEL,
  fieldElementId,
  LEAVE_ACCRUAL_METHODS,
  LEAVE_KIND_LABEL,
  LEAVE_KINDS,
  leavePolicyPayload,
  leavePolicyToForm,
  PAYOUT_LABEL,
  PAYOUT_ON_TERMINATION,
  STATUTORY_RULE_CLASSES,
  visibleLeavePolicyFields,
  type LeaveFieldProblem,
  type LeavePolicyField,
  type LeavePolicyForm,
} from "./policy-form";

/** The schedule classes `hr.leave_policy.schedule_class_scope` is filtered against. */
const SCHEDULE_CLASSES = ["full_time", "part_time", "variable", "per_diem"] as const;

// ── small building blocks ────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function FieldShell({
  field,
  children,
  problem,
  full = false,
}: {
  field: LeavePolicyField;
  children: React.ReactNode;
  problem?: string;
  full?: boolean;
}) {
  const help = FIELD_HELP[field];
  return (
    <div className={cn("min-w-0 space-y-1.5", full && "sm:col-span-2")}>
      <Label htmlFor={fieldElementId(field)} className="text-xs font-medium">
        {FIELD_LABEL[field]}
      </Label>
      {children}
      {help ? <p className="text-[11px] leading-snug text-muted-foreground">{help}</p> : null}
      {problem ? (
        <p role="alert" className="text-[11px] leading-snug text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

// ── the blackout editor (§2.4) ───────────────────────────────────────────────

function BlackoutEditor({
  rules,
  statutory,
  onChange,
}: {
  rules: LeavePolicyBlackout[];
  statutory: boolean;
  onChange: (next: LeavePolicyBlackout[]) => void;
}) {
  const update = (index: number, patch: Partial<LeavePolicyBlackout>) => {
    onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));
  };

  return (
    <div className="space-y-3 sm:col-span-2">
      {/*
        🚨 THE BLACKOUT FLOOR (§2.4). A blackout may never block a request against a policy
        that carries a statutory basis, and the SERVER re-applies that in `hr.leave_wf_validate`
        regardless of what this jsonb says. So on a statutory policy the admin is told the
        exemption is unconditional rather than being offered a control that cannot take effect.
      */}
      {statutory ? (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            This policy carries a legal minimum, so a blackout window can never block a request
            against it. Required by law — cannot be removed. The rule is re-applied when a
            request is checked, whatever is set here.
          </p>
        </div>
      ) : null}

      {rules.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No blackout windows. Requests are never blocked by a date range.
        </p>
      ) : null}

      {rules.map((rule, index) => (
        <div key={rule.key ?? index} className="space-y-3 rounded-md border border-border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">What people see it called</Label>
              <Input
                value={rule.label ?? ""}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Holiday freeze"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">What it does</Label>
              <Select
                value={rule.mode ?? "block"}
                onValueChange={(value) => update(index, { mode: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="block">Blocks requests in the window</SelectItem>
                  <SelectItem value="require_escalation">
                    Sends requests a rung higher instead of blocking
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input
                value={rule.from ?? ""}
                onChange={(e) => update(index, { from: e.target.value })}
                placeholder={rule.recurringAnnual ? "12-20" : "2026-12-20"}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input
                value={rule.to ?? ""}
                onChange={(e) => update(index, { to: e.target.value })}
                placeholder={rule.recurringAnnual ? "01-02" : "2027-01-02"}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id={`blackout-recurring-${index}`}
              checked={rule.recurringAnnual === true}
              onCheckedChange={(checked) =>
                update(index, { recurringAnnual: checked === true })
              }
            />
            <Label htmlFor={`blackout-recurring-${index}`} className="text-xs font-normal">
              Happens every year on the same dates (use MM-DD above)
            </Label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              What the employee is told when this blocks their request
            </Label>
            <Textarea
              rows={2}
              value={rule.note ?? ""}
              onChange={(e) => update(index, { note: e.target.value })}
              placeholder="Shown to the employee word for word."
            />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(rules.filter((_, i) => i !== index))}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remove this window
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...rules,
            {
              key: `blackout_${Date.now()}`,
              label: "",
              from: "",
              to: "",
              recurringAnnual: true,
              mode: "block",
              note: "",
              maxConcurrentOut: null,
              exemptLeaveKinds: ["sick", "jury", "parental"],
            },
          ])
        }
      >
        <Plus className="mr-2 h-4 w-4" />
        Add a blackout window
      </Button>
    </div>
  );
}

// ── the surface ──────────────────────────────────────────────────────────────

export function LeavePolicyEditorSurface({ policyId }: { policyId: string }) {
  const { active, orgRef } = useHrContext();
  const router = useRouter();
  const organizationId = active?.organization_id ?? null;
  const isNew = policyId === LEAVE_POLICY_NEW;

  const [list, setList] = useState<LeavePolicyList | null>(null);
  const [loadError, setLoadError] = useState<HrDenied | HrFailed | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [form, setForm] = useState<LeavePolicyForm | null>(null);
  const [validation, setValidation] = useState<LeavePolicyValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<LeaveSaveRefusal | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  const structure = useHrSettingsStructure(organizationId);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      const result = await fetchLeavePolicies(organizationId, {
        signal: controller.signal,
      });
      if (cancelled) return;
      if (result.ok) {
        setList(result.data);
        setLoadError(null);
      } else {
        setLoadError(result);
      }
      setLoadedFor(organizationId);
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [organizationId, reloadToken]);

  const saved: LeavePolicy | null = useMemo(
    () => (isNew ? null : (list?.policies.find((p) => p.id === policyId) ?? null)),
    [isNew, list, policyId],
  );

  // Seed the form ONCE per loaded policy. Re-seeding on every render would throw away
  // whatever the admin has typed, which is precisely what §2.6 forbids after a refusal.
  useEffect(() => {
    if (form !== null) return;
    if (isNew) {
      setForm(emptyLeavePolicyForm());
      return;
    }
    if (saved) setForm(leavePolicyToForm(saved));
  }, [form, isNew, saved]);

  const canWrite = list?.canWrite === true;
  const loading = organizationId !== null && loadedFor !== organizationId;
  const notFound = !loading && !isNew && list !== null && saved === null;

  const fields = form ? visibleLeavePolicyFields(form) : new Set<LeavePolicyField>();
  const problems: LeaveFieldProblem[] = form ? checkConstraintProblems(form) : [];
  const problemFor = (field: LeavePolicyField): string | undefined =>
    problems.find((p) => p.field === field)?.message;

  const set = <K extends keyof LeavePolicyForm>(key: K, value: LeavePolicyForm[K]) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  /**
   * The §2.6 client twin. Called on blur of a governed field and again before submit — a READ
   * that never writes and never clamps. It is deliberately best-effort: a failed twin must not
   * stop somebody editing, because the authoritative check is the trigger behind the save.
   */
  const runTwin = useCallback(async () => {
    if (!organizationId || !form) return;
    setValidating(true);
    const result = await validateLeavePolicy({
      organizationId,
      payload: leavePolicyPayload(form),
    });
    setValidating(false);
    if (result.ok) setValidation(result.data);
  }, [organizationId, form]);

  function focusField(field: string | null) {
    if (!field) return;
    // The dialog closes first, so the focus lands on a control that is actually on screen.
    window.setTimeout(() => {
      const element = document.getElementById(fieldElementId(field));
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        element.focus({ preventScroll: true });
      }
    }, 60);
  }

  /** Take a violation's own fix: merge its `set`, focus its `focus_field`, touch nothing else. */
  function takeFix(finding: LeaveConfigViolation) {
    setForm((current) => (current ? applyLeaveFix(current, finding.fix?.set ?? null) : current));
    setRefusal(null);
    focusField(finding.fix?.focusField ?? finding.field ?? null);
  }

  async function persist(nextActive: boolean, acceptWarnings = false) {
    if (!organizationId || !form) return;

    const blocking = checkConstraintProblems({ ...form, isActive: nextActive });
    if (blocking.length > 0) {
      setWriteError(null);
      focusField(blocking[0].field);
      toast.error(blocking[0].message);
      return;
    }

    // §2.7 — the impact preview before an owner changes an ACTIVE policy's accrual method.
    // The door refuses this outright for anyone below `hr_owner`; for an owner it goes
    // through, so the preview has to be here or it is nowhere.
    if (
      saved?.isActive === true &&
      form.accrualMethod !== saved.accrualMethod &&
      !acceptWarnings
    ) {
      const enrolled = saved.enrolledCount;
      const confirmed = await confirm({
        title: "Change how this policy earns time?",
        description: (
          <span className="space-y-2">
            <span className="block">
              {enrolled === null
                ? "Everyone enrolled in this policy will earn time a different way from now on."
                : `${enrolled} ${enrolled === 1 ? "person is" : "people are"} enrolled. From now on they earn time a different way.`}
            </span>
            <span className="block">
              Past ledger entries are not touched. The accrual runner uses the version of this
              policy that was in force at each accrual date, and never re-applies a change
              backwards.
            </span>
          </span>
        ),
        confirmLabel: "Change it",
        variant: "destructive",
      });
      if (!confirmed) return;
    }

    setBusy(true);
    setWriteError(null);
    const result = await saveLeavePolicy({
      organizationId,
      payload: leavePolicyPayload({ ...form, isActive: nextActive }),
      acceptWarnings,
    });
    setBusy(false);

    if (result.ok) {
      setRefusal(null);
      setValidation(result.data.validation);
      toast.success(
        nextActive ? "Policy saved and active" : "Draft saved — it is not active yet",
      );
      setReloadToken((n) => n + 1);
      if (isNew && result.data.policyId) {
        router.replace(leavePolicyHref(result.data.policyId, orgRef));
        // The form is re-seeded from the reload, under its real id.
        setForm((current) => (current ? { ...current, id: result.data.policyId } : current));
      } else {
        setForm((current) => (current ? { ...current, isActive: nextActive } : current));
      }
      return;
    }

    if (isHrDenied(result)) {
      const lifted = leaveSaveRefusal(result);
      // The three named refusals ARE the rejection UX. Anything else is a plain refusal
      // (no HR standing, policy gone) and belongs in the page's own alert.
      if (
        lifted.reason === "unlawful_configuration" ||
        lifted.reason === "warnings_unacknowledged" ||
        lifted.reason === "accrual_method_change_requires_owner"
      ) {
        setRefusal(lifted);
        if (lifted.validation) setValidation(lifted.validation);
        return;
      }
      setWriteError(lifted.detail ?? "This policy could not be saved.");
      return;
    }
    setWriteError(result.message);
  }

  const earningCodes = structure.structure?.earning_codes ?? [];
  const statutory = (form?.statutoryBasisRuleClass ?? "") !== "";

  return (
    <HrSettingsShell
      section="leave-policies"
      loading={loading || form === null}
      error={loadError}
      granted={notFound ? false : undefined}
      operation="This leave policy"
      onRetry={() => setReloadToken((n) => n + 1)}
    >
      {form ? (
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Button asChild variant="ghost" size="sm" className="-ml-2 h-8">
                <Link href={hrSettingsHref("leave-policies", { org: orgRef })}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  All leave policies
                </Link>
              </Button>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-semibold text-foreground">
                  {isNew ? "New leave policy" : (saved?.name ?? "Leave policy")}
                </h1>
                {!isNew ? (
                  <Badge variant={form.isActive ? "secondary" : "outline"}>
                    {form.isActive ? "Active" : "Draft"}
                  </Badge>
                ) : null}
                {saved?.version !== null && saved?.version !== undefined ? (
                  <span className="text-xs text-muted-foreground">v{saved.version}</span>
                ) : null}
              </div>
            </div>

            {!isNew && saved ? (
              <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                <Link href={leavePolicyEnrollmentHref(saved.id, orgRef)}>
                  <Users className="mr-2 h-4 w-4" />
                  {saved.enrolledCount === null
                    ? "Who is on this policy"
                    : `${saved.enrolledCount} enrolled`}
                </Link>
              </Button>
            ) : null}
          </div>

          {!canWrite ? (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm text-muted-foreground">
                You can read this policy. Changing it is done by whoever runs HR for this
                employer.
              </p>
            </div>
          ) : null}

          {writeError ? (
            <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{writeError}</p>
            </div>
          ) : null}

          {/*
            §2.5's honest half. The floor VALUES are not reachable from a client (see the header),
            so what is shown is what the validator actually returned: the places it checked, and
            an amber banner when any rule it consulted is one we have not verified.
          */}
          {validation ? (
            <div className="space-y-2">
              {validation.checked === false && validation.detail ? (
                <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {validation.detail}
                  </p>
                </div>
              ) : null}

              {validation.advisoryRulesConsulted.length > 0 ? (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                  <p className="text-xs leading-relaxed text-foreground">
                    We have not yet verified{" "}
                    {validation.advisoryRulesConsulted.length === 1
                      ? "one of the rules"
                      : `${validation.advisoryRulesConsulted.length} of the rules`}{" "}
                    that apply here. Your policy will run as configured. We will tell you if
                    verification changes anything.
                  </p>
                </div>
              ) : null}

              {validation.checked === true && validation.ok === true ? (
                <div className="flex items-start gap-2 rounded-md border border-border bg-card p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Checked against{" "}
                    {validation.jurisdictionsChecked.length > 0
                      ? validation.jurisdictionsChecked.join(", ")
                      : "no jurisdictions — this employer has no active establishments"}
                    . Nothing in this configuration conflicts with a legal minimum we hold.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── The policy ───────────────────────────────────────────────── */}

          <Section
            title="What this policy is"
            description="The name people see when they request time off, and what kind of leave it is."
          >
            <FieldShell field="name" problem={problemFor("name")}>
              <Input
                id={fieldElementId("name")}
                value={form.name}
                disabled={!canWrite}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Paid time off"
              />
            </FieldShell>

            <FieldShell field="leave_kind">
              <Select
                value={form.leaveKind}
                disabled={!canWrite}
                onValueChange={(value) => set("leaveKind", value)}
              >
                <SelectTrigger id={fieldElementId("leave_kind")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {LEAVE_KIND_LABEL[kind] ?? kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>

            <FieldShell field="statutory_basis_rule_class" full>
              <Select
                value={form.statutoryBasisRuleClass || "__none__"}
                disabled={!canWrite}
                onValueChange={(value) =>
                  set("statutoryBasisRuleClass", value === "__none__" ? "" : value)
                }
              >
                <SelectTrigger id={fieldElementId("statutory_basis_rule_class")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUTORY_RULE_CLASSES.map((option) => (
                    <SelectItem key={option.value} value={option.value || "__none__"}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Say which legal minimum this policy is meant to satisfy. A policy with no
                statutory basis is never checked against one — and the check will tell you so
                rather than implying it passed.
              </p>
            </FieldShell>

            {canWrite ? (
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button type="button" variant="outline" size="sm" onClick={runTwin}>
                  {validating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                  )}
                  Check this against the law now
                </Button>
              </div>
            ) : null}
          </Section>

          {/* ── Earning ──────────────────────────────────────────────────── */}

          <Section
            title="How time is earned"
            description={ACCRUAL_METHOD_HELP[form.accrualMethod as never] ?? undefined}
          >
            <FieldShell field="accrual_method">
              <Select
                value={form.accrualMethod}
                disabled={!canWrite}
                onValueChange={(value) => set("accrualMethod", value)}
              >
                <SelectTrigger id={fieldElementId("accrual_method")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_ACCRUAL_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {ACCRUAL_METHOD_LABEL[method]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>

            {fields.has("accrual_rate") ? (
              <FieldShell field="accrual_rate" problem={problemFor("accrual_rate")}>
                <Input
                  id={fieldElementId("accrual_rate")}
                  inputMode="decimal"
                  value={form.accrualRate}
                  disabled={!canWrite}
                  onChange={(e) => set("accrualRate", e.target.value)}
                  onBlur={runTwin}
                  placeholder="1"
                />
              </FieldShell>
            ) : null}

            {fields.has("accrual_per_units") ? (
              <FieldShell field="accrual_per_units" problem={problemFor("accrual_per_units")}>
                <Input
                  id={fieldElementId("accrual_per_units")}
                  inputMode="decimal"
                  value={form.accrualPerUnits}
                  disabled={!canWrite}
                  onChange={(e) => set("accrualPerUnits", e.target.value)}
                  onBlur={runTwin}
                  placeholder="30"
                />
              </FieldShell>
            ) : null}

            <FieldShell field="accrual_starts">
              <Select
                value={form.accrualStarts}
                disabled={!canWrite}
                onValueChange={(value) => set("accrualStarts", value)}
              >
                <SelectTrigger id={fieldElementId("accrual_starts")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCRUAL_STARTS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {ACCRUAL_STARTS_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldShell>

            {/*
              🚨 THE EARNING WAIT. Present ONLY when earning is deliberately delayed, and it
              never sits beside the spending wait — §2.3's conflation defect.
            */}
            {fields.has("waiting_period_days") ? (
              <FieldShell field="waiting_period_days">
                <Input
                  id={fieldElementId("waiting_period_days")}
                  inputMode="numeric"
                  value={form.waitingPeriodDays}
                  disabled={!canWrite}
                  onChange={(e) => set("waitingPeriodDays", e.target.value)}
                  onBlur={runTwin}
                />
              </FieldShell>
            ) : null}
          </Section>

          {/* ── Spending ─────────────────────────────────────────────────── */}

          <Section
            title="When time can be spent"
            description="Separate from earning. An employee can be earning time for weeks before they are allowed to book any of it."
          >
            {/* 🚨 THE SPENDING WAIT — its own section, on purpose. */}
            <FieldShell field="usable_after_days">
              <Input
                id={fieldElementId("usable_after_days")}
                inputMode="numeric"
                value={form.usableAfterDays}
                disabled={!canWrite}
                onChange={(e) => set("usableAfterDays", e.target.value)}
                onBlur={runTwin}
              />
            </FieldShell>

            <FieldShell field="increment_minutes" problem={problemFor("increment_minutes")}>
              <Input
                id={fieldElementId("increment_minutes")}
                inputMode="numeric"
                value={form.incrementMinutes}
                disabled={!canWrite}
                onChange={(e) => set("incrementMinutes", e.target.value)}
              />
            </FieldShell>

            <FieldShell field="documentation_required_after_days">
              <Input
                id={fieldElementId("documentation_required_after_days")}
                inputMode="numeric"
                value={form.documentationRequiredAfterDays}
                disabled={!canWrite}
                onChange={(e) => set("documentationRequiredAfterDays", e.target.value)}
                onBlur={runTwin}
                placeholder="Leave empty for never"
              />
            </FieldShell>

            {fields.has("earning_code_id") ? (
              <FieldShell field="earning_code_id" problem={problemFor("earning_code_id")}>
                <Select
                  value={form.earningCodeId || "__none__"}
                  disabled={!canWrite}
                  onValueChange={(value) =>
                    set("earningCodeId", value === "__none__" ? "" : value)
                  }
                >
                  <SelectTrigger id={fieldElementId("earning_code_id")}>
                    <SelectValue placeholder="Choose an earning code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not chosen</SelectItem>
                    {earningCodes.map((code) => (
                      <SelectItem key={code.id} value={code.id}>
                        {code.name} ({code.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            ) : null}
          </Section>

          {/* ── The balance ──────────────────────────────────────────────── */}

          {form.accrualMethod === "unlimited" ? (
            // §2.3: `unlimited` hides every cap, carryover, negative-balance and payout
            // control. ABSENT, not disabled — there is no balance for them to describe.
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground">The balance</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                An unlimited policy keeps no balance, so there is nothing to cap, carry over,
                let go negative, or pay out. Balance screens will read{" "}
                <span className="font-medium text-foreground">Unlimited</span> — never a
                number, never a zero, never a bar. Requests still need approval and still land
                on the timesheet.
              </p>
            </div>
          ) : (
            <Section
              title="The balance"
              description="Caps, carry-over, going negative, and what happens when somebody leaves."
            >
              {fields.has("annual_accrual_cap") ? (
                <FieldShell field="annual_accrual_cap">
                  <Input
                    id={fieldElementId("annual_accrual_cap")}
                    inputMode="decimal"
                    value={form.annualAccrualCap}
                    disabled={!canWrite}
                    onChange={(e) => set("annualAccrualCap", e.target.value)}
                    onBlur={runTwin}
                    placeholder="Leave empty for no cap"
                  />
                </FieldShell>
              ) : null}

              {fields.has("balance_cap") ? (
                <FieldShell field="balance_cap" problem={problemFor("balance_cap")}>
                  <Input
                    id={fieldElementId("balance_cap")}
                    inputMode="decimal"
                    value={form.balanceCap}
                    disabled={!canWrite}
                    onChange={(e) => set("balanceCap", e.target.value)}
                    onBlur={runTwin}
                    placeholder="Leave empty for no cap"
                  />
                </FieldShell>
              ) : null}

              <div className="flex items-start gap-3 sm:col-span-2">
                <Switch
                  id={fieldElementId("carryover_allowed")}
                  checked={form.carryoverAllowed}
                  disabled={!canWrite}
                  onCheckedChange={(checked) => {
                    set("carryoverAllowed", checked);
                    void runTwin();
                  }}
                />
                <div className="min-w-0 space-y-1">
                  <Label htmlFor={fieldElementId("carryover_allowed")} className="text-xs">
                    {FIELD_LABEL.carryover_allowed}
                  </Label>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Switching this off means unused time is forfeited at the policy-year
                    boundary. Several states do not allow that for earned vacation — the check
                    will refuse it and tell you what to do instead.
                  </p>
                </div>
              </div>

              {fields.has("carryover_cap") ? (
                <FieldShell field="carryover_cap">
                  <Input
                    id={fieldElementId("carryover_cap")}
                    inputMode="decimal"
                    value={form.carryoverCap}
                    disabled={!canWrite}
                    onChange={(e) => set("carryoverCap", e.target.value)}
                    onBlur={runTwin}
                    placeholder="Leave empty for no limit"
                  />
                </FieldShell>
              ) : null}

              {fields.has("carryover_expires_after_days") ? (
                <FieldShell field="carryover_expires_after_days">
                  <Input
                    id={fieldElementId("carryover_expires_after_days")}
                    inputMode="numeric"
                    value={form.carryoverExpiresAfterDays}
                    disabled={!canWrite}
                    onChange={(e) => set("carryoverExpiresAfterDays", e.target.value)}
                    onBlur={runTwin}
                    placeholder="Leave empty — it never expires"
                  />
                </FieldShell>
              ) : null}

              <div className="flex items-start gap-3 sm:col-span-2">
                <Switch
                  id={fieldElementId("negative_balance_allowed")}
                  checked={form.negativeBalanceAllowed}
                  disabled={!canWrite}
                  onCheckedChange={(checked) => set("negativeBalanceAllowed", checked)}
                />
                <Label
                  htmlFor={fieldElementId("negative_balance_allowed")}
                  className="text-xs font-normal"
                >
                  {FIELD_LABEL.negative_balance_allowed}
                </Label>
              </div>

              {fields.has("negative_balance_floor") ? (
                <FieldShell
                  field="negative_balance_floor"
                  problem={problemFor("negative_balance_floor")}
                >
                  <Input
                    id={fieldElementId("negative_balance_floor")}
                    inputMode="decimal"
                    value={form.negativeBalanceFloor}
                    disabled={!canWrite}
                    onChange={(e) => set("negativeBalanceFloor", e.target.value)}
                    placeholder="-16"
                  />
                </FieldShell>
              ) : null}

              {fields.has("payout_on_termination") ? (
                <FieldShell field="payout_on_termination">
                  <Select
                    value={form.payoutOnTermination}
                    disabled={!canWrite}
                    onValueChange={(value) => {
                      set("payoutOnTermination", value);
                      void runTwin();
                    }}
                  >
                    <SelectTrigger id={fieldElementId("payout_on_termination")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYOUT_ON_TERMINATION.map((value) => (
                        <SelectItem key={value} value={value}>
                          {PAYOUT_LABEL[value]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldShell>
              ) : null}

              {fields.has("reinstate_on_rehire_within_days") ? (
                <FieldShell field="reinstate_on_rehire_within_days">
                  <Input
                    id={fieldElementId("reinstate_on_rehire_within_days")}
                    inputMode="numeric"
                    value={form.reinstateOnRehireWithinDays}
                    disabled={!canWrite}
                    onChange={(e) => set("reinstateOnRehireWithinDays", e.target.value)}
                    onBlur={runTwin}
                    placeholder="Leave empty for never"
                  />
                </FieldShell>
              ) : null}
            </Section>
          )}

          {/* ── Who it covers ────────────────────────────────────────────── */}

          <Section
            title="Who this policy can cover"
            description="Narrows who may be enrolled. Enrolment itself happens on the policy's own roster."
          >
            <div className="space-y-2">
              <Label className="text-xs font-medium">Worker classes</Label>
              <div className="flex flex-wrap gap-3">
                {HR_WORKER_CLASSES.map((workerClass) => (
                  <label
                    key={workerClass}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <Checkbox
                      checked={form.workerClassScope.includes(workerClass)}
                      disabled={!canWrite}
                      onCheckedChange={(checked) =>
                        set(
                          "workerClassScope",
                          checked === true
                            ? [...form.workerClassScope, workerClass]
                            : form.workerClassScope.filter((c) => c !== workerClass),
                        )
                      }
                    />
                    {workerClass.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Leave every box clear to allow any worker class. Contractors are never enrolled
                automatically, whatever is ticked here.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Schedule classes</Label>
              <div className="flex flex-wrap gap-3">
                {SCHEDULE_CLASSES.map((scheduleClass) => (
                  <label
                    key={scheduleClass}
                    className="flex items-center gap-2 text-xs text-foreground"
                  >
                    <Checkbox
                      checked={form.scheduleClassScope.includes(scheduleClass)}
                      disabled={!canWrite}
                      onCheckedChange={(checked) =>
                        set(
                          "scheduleClassScope",
                          checked === true
                            ? [...form.scheduleClassScope, scheduleClass]
                            : form.scheduleClassScope.filter((c) => c !== scheduleClass),
                        )
                      }
                    />
                    {scheduleClass.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
            </div>
          </Section>

          {/* ── Reasons and blackouts (§2.4) ─────────────────────────────── */}

          <Section
            title="Reasons and blackout windows"
            description="Reasons that may never be refused, and the date ranges when requests are blocked."
          >
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-xs font-medium">
                Reasons that may never be refused
              </Label>
              {form.mandatedUses.length === 0 ? (
                <p className="text-xs text-muted-foreground">None set.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {form.mandatedUses.map((use) => (
                    <Badge key={use} variant="secondary" className="gap-1.5">
                      {use.replace(/_/g, " ")}
                      {/*
                        🚨 REMOVAL IS ABSENT ON A STATUTORY POLICY. §2.4 lets an org ADD a use
                        and never remove one the law requires — and we cannot yet tell which of
                        these the law requires, because the resolved `permitted_uses` are not
                        reachable from a client. Absence is the safe direction; a remove control
                        that might drop a statutory use is not.
                      */}
                      {canWrite && !statutory ? (
                        <button
                          type="button"
                          aria-label={`Remove ${use.replace(/_/g, " ")}`}
                          onClick={() =>
                            set(
                              "mandatedUses",
                              form.mandatedUses.filter((u) => u !== use),
                            )
                          }
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <Ban className="h-3 w-3" />
                        </button>
                      ) : null}
                    </Badge>
                  ))}
                </div>
              )}
              {statutory ? (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  This policy carries a legal minimum. Reasons can be added; they cannot be
                  removed here, because removing one the law requires would make the policy
                  unlawful without anything telling you.
                </p>
              ) : null}
              {canWrite ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {["own_illness", "family_care", "safe_time", "bereavement"]
                    .filter((use) => !form.mandatedUses.includes(use))
                    .map((use) => (
                      <Button
                        key={use}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => set("mandatedUses", [...form.mandatedUses, use])}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        {use.replace(/_/g, " ")}
                      </Button>
                    ))}
                </div>
              ) : null}
            </div>

            <BlackoutEditor
              rules={form.blackoutRules}
              statutory={statutory}
              onChange={(next) => set("blackoutRules", next)}
            />
          </Section>

          {/* ── Actions (§2.7) ───────────────────────────────────────────── */}

          {canWrite ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4">
              {!form.isActive ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void persist(false)}
                    className="min-h-11 sm:min-h-9"
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save as a draft
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void persist(true)}
                    className="min-h-11 sm:min-h-9"
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Activate
                  </Button>
                  <p className="w-full text-[11px] text-muted-foreground">
                    A draft earns nobody anything: the accrual runner only picks up active
                    policies. Activating runs the full lawfulness check across every place this
                    employer operates.
                  </p>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void persist(true)}
                    className="min-h-11 sm:min-h-9"
                  >
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    className="min-h-11 sm:min-h-9"
                    onClick={async () => {
                      const confirmed = await confirm({
                        title: "Stop this policy earning time?",
                        description: (
                          <span className="space-y-2">
                            <span className="block">
                              Accrual stops. Balances people already hold stay exactly as they
                              are, and they can still spend them.
                            </span>
                            <span className="block">
                              Paying balances out, or moving everyone to another policy, is not
                              something this screen can do — that runs through the ledger and
                              needs its own entries.
                            </span>
                          </span>
                        ),
                        confirmLabel: "Stop accrual",
                        variant: "destructive",
                      });
                      if (confirmed) void persist(false);
                    }}
                  >
                    <Ban className="mr-2 h-4 w-4" />
                    Stop accrual
                  </Button>
                  {/*
                    §2.7: DELETE IS ABSENT. A policy with ledger history cannot be deleted, and
                    there is no soft-delete door here for a never-activated draft either.
                  */}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      <UnlawfulConfigDialog
        open={refusal !== null}
        onOpenChange={(open) => {
          if (!open) setRefusal(null);
        }}
        refusal={refusal}
        onTakeFix={takeFix}
        onSaveAnyway={() => {
          setRefusal(null);
          void persist(form?.isActive ?? false, true);
        }}
        busy={busy}
      />
    </HrSettingsShell>
  );
}
