"use client";

// features/hr/people/profile/ProposePayChange.tsx
//
// The pay-change PROPOSAL (SPEC-EMPLOYEES §4.4). Round 18 fixed who may approve;
// until this shipped, nothing in the product could propose.
//
// 🚨 NO PAGE APPROVES A RAISE ITSELF. `hr_compensation_upsert` does not write
// compensation — it opens a `pay_change` workflow instance and returns what that
// routing decided. So this form's success state is "sent for approval", never
// "saved", and the amount typed here does not exist on anybody's record until an
// approver acts.
//
// 🚨 `ok: true` IS NOT SUCCESS ON THIS DOOR. The envelope is
// `{ok: true, routed: 'workflow', instance: {...}}`, and the INSTANCE carries its own
// `granted`. A pre-flight refusal — nobody can approve this yet — arrives as
// `{ok: true, instance: {granted: false, reason: 'WF_NO_POSSIBLE_APPROVER', ...}}`,
// so a client that checks only the outer `ok` reports a submitted request that does
// not exist. Verified live before this was written.
//
// 🚨 THE PAYLOAD KEY IS `component_kind`, NOT `component`. `hr._l1_apply_compensation`
// reads `component_kind` and defaults it to `'base'` when absent — so a form sending
// `component` would have every bonus, differential and allowance silently approved as
// a change to base salary. All three vocabularies below are the table's own CHECK
// constraints, read from `hr.compensation`, because a value outside them fails at the
// end of an approval chain rather than here.

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShieldQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { upsertHrCompensation } from "../../service";
import { hrTasksHref, type HrOrgRef } from "../../routes";
import type { HrEmployeeProfile } from "../../types";

/** `hr.compensation_component_kind_check`, verbatim. */
const COMPONENT_KINDS = [
  { value: "base", label: "Base pay" },
  { value: "differential", label: "Differential" },
  { value: "variable_plan", label: "Variable plan" },
  { value: "allowance", label: "Allowance" },
  { value: "contract_rate", label: "Contract rate" },
  { value: "piece_rate", label: "Piece rate" },
] as const;

/** `hr.compensation_pay_basis_check`, verbatim. */
const PAY_BASES = [
  { value: "salary", label: "Salary" },
  { value: "hourly", label: "Hourly" },
  { value: "piece", label: "Piece" },
  { value: "commission", label: "Commission" },
  { value: "contract", label: "Contract" },
] as const;

/** `hr.compensation_per_unit_check`, verbatim. */
const PER_UNITS = [
  { value: "year", label: "per year" },
  { value: "hour", label: "per hour" },
  { value: "month", label: "per month" },
  { value: "week", label: "per week" },
  { value: "piece", label: "per piece" },
  { value: "engagement", label: "per engagement" },
] as const;

type Outcome =
  | { kind: "submitted"; instanceId: string | null }
  /** The workflow could not route this. Rendered as DATA, with its own door. */
  | {
      kind: "no_approver";
      detail: string;
      remedy: string | null;
      actionType: string | null;
    }
  /** An open request already exists on this person — one per assignment. */
  | { kind: "already_open"; detail: string; instanceId: string | null }
  | { kind: "refused"; detail: string; door: string | null }
  | { kind: "failed"; message: string };

function readText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function ProposePayChange({
  profile,
  org,
  onProposed,
  className,
}: {
  profile: HrEmployeeProfile;
  org: HrOrgRef;
  onProposed?: () => void;
  className?: string;
}) {
  const employmentId = profile.header.employment_id;
  const canPropose = profile.capabilities.includes("comp.write");

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [form, setForm] = useState({
    component_kind: "base",
    pay_basis: "salary",
    per_unit: "year",
    amount: "",
    effective_from: "",
    change_reason: "",
  });

  // §4.2 — absent, not disabled. And a person with no live spell has nothing to
  // change: the door would answer `not_reachable`.
  if (!canPropose || !employmentId) return null;

  const set = (patch: Partial<typeof form>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    setBusy(true);
    setOutcome(null);
    const result = await upsertHrCompensation({
      employment_id: employmentId,
      effective_from: form.effective_from,
      component_kind: form.component_kind,
      pay_basis: form.pay_basis,
      per_unit: form.per_unit,
      amount: Number(form.amount),
      currency: "USD",
      dating_mode: "amendment",
      change_reason: form.change_reason,
    });
    setBusy(false);

    if (!result.ok) {
      setOutcome({
        kind: "refused",
        detail:
          result.kind === "denied"
            ? (result.detail ?? result.reason)
            : result.message,
        door: result.kind === "denied" ? result.door : null,
      });
      return;
    }

    // 🚨 The instance owns the verdict — see the file header.
    const instance = (result.data.instance ?? {}) as Record<string, unknown>;
    if (instance.granted === false) {
      const reason = readText(instance, "reason");
      if (reason === "WF_BINDING_OPEN") {
        setOutcome({
          kind: "already_open",
          detail:
            readText(instance, "detail") ??
            "A pay change is already open for this person.",
          instanceId: readText(instance, "existing_instance_id"),
        });
        return;
      }
      setOutcome({
        kind: "no_approver",
        detail:
          readText(instance, "detail") ??
          "This request could not be routed to anybody.",
        remedy: readText(instance, "remedy"),
        actionType: readText(instance, "action_type"),
      });
      return;
    }

    setOutcome({ kind: "submitted", instanceId: readText(instance, "instance_id") });
    onProposed?.();
  };

  if (!open) {
    return (
      <div className={className}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          onClick={() => setOpen(true)}
        >
          Propose a pay change
        </Button>
      </div>
    );
  }

  return (
    <section
      className={cn(
        "max-w-xl space-y-3 rounded-lg border border-border bg-card p-3",
        className,
      )}
    >
      <div className="space-y-0.5">
        <h4 className="text-sm font-semibold text-foreground">Propose a pay change</h4>
        <p className="text-xs text-muted-foreground">
          This does not change anybody&apos;s pay. It opens a request that somebody
          with the authority to approve pay has to act on.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="What kind of pay">
          <Select
            value={form.component_kind}
            onValueChange={(v) => set({ component_kind: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPONENT_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Basis">
          <Select value={form.pay_basis} onValueChange={(v) => set({ pay_basis: v })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAY_BASES.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Amount">
          <Input
            type="number"
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => set({ amount: e.target.value })}
            className="h-9"
          />
        </Field>

        <Field label="Per">
          <Select value={form.per_unit} onValueChange={(v) => set({ per_unit: v })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PER_UNITS.map((u) => (
                <SelectItem key={u.value} value={u.value}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Effective from">
          <Input
            type="date"
            value={form.effective_from}
            onChange={(e) => set({ effective_from: e.target.value })}
            className="h-9"
          />
        </Field>

        <Field label="Reason">
          <Input
            value={form.change_reason}
            onChange={(e) => set({ change_reason: e.target.value })}
            placeholder="Why this change"
            className="h-9"
          />
        </Field>
      </div>

      {outcome ? <OutcomeLine outcome={outcome} org={org} /> : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={
            busy ||
            !form.amount.trim() ||
            !form.effective_from ||
            !form.change_reason.trim()
          }
          onClick={() => void submit()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Sending…
            </>
          ) : (
            "Send for approval"
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setOutcome(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </section>
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
    <label className="min-w-0 space-y-1">
      <span className="block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Every non-submitted outcome, said as the thing it is.
 *
 * 🚨 `no_approver` IS NOT AN ERROR AND NOT A FAILURE OF THIS FORM. The request was
 * well-formed and the organization simply has nobody who may approve it — which is a
 * governance fact with a governance remedy, and the server words both. Rendering it
 * as "something went wrong" would send an HR admin looking for a bug instead of
 * granting the authority.
 */
function OutcomeLine({ outcome, org }: { outcome: Outcome; org: HrOrgRef }) {
  if (outcome.kind === "submitted") {
    return (
      <p className="text-sm text-foreground">
        Sent for approval. Nothing changes until it is approved —{" "}
        <Link
          href={hrTasksHref(org)}
          className="underline underline-offset-2 hover:text-primary"
        >
          see it in the approvals queue
        </Link>
        .
      </p>
    );
  }

  if (outcome.kind === "no_approver") {
    return (
      <div className="space-y-1 rounded-md border border-dashed border-border bg-muted/40 p-2.5">
        <p className="flex items-start gap-1.5 text-sm text-foreground">
          <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span>{outcome.detail}</span>
        </p>
        {outcome.remedy ? (
          <p className="text-xs text-muted-foreground">{outcome.remedy}</p>
        ) : null}
      </div>
    );
  }

  if (outcome.kind === "already_open") {
    return (
      <p className="text-sm text-foreground">
        {outcome.detail}{" "}
        <Link
          href={hrTasksHref(org)}
          className="underline underline-offset-2 hover:text-primary"
        >
          Open the approvals queue
        </Link>
        .
      </p>
    );
  }

  if (outcome.kind === "refused") {
    return (
      <p className="text-sm text-destructive">
        {outcome.detail}
        {outcome.door ? (
          <>
            {" "}
            <Link
              href={outcome.door}
              className="underline underline-offset-2 hover:text-primary"
            >
              Open it
            </Link>
            .
          </>
        ) : null}
      </p>
    );
  }

  return <p className="text-sm text-destructive">{outcome.message}</p>;
}
