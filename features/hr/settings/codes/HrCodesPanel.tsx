// features/hr/settings/codes/HrCodesPanel.tsx
//
// ROUTE 72 — EARNING AND DEDUCTION CODES. The vocabulary every timesheet line and
// every payroll export is written against.
//
// ── 🚨 THE THREE INCLUSION SWITCHES ARE INDEPENDENT, AND EACH SAYS WHY ─────
// The recurring bug in every payroll system is treating these as one flag. They
// answer three different legal questions and a given code routinely answers them
// differently:
//
//   counts_toward_ot                — FLSA overtime: hours WORKED over forty.
//                                     Holiday and PTO hours are not worked, so a
//                                     PTO code is normally OFF here.
//   counts_toward_hours_of_service  — ACA / FMLA eligibility: hours for which an
//                                     employee is PAID or entitled to pay, worked
//                                     or not. The same PTO code is normally ON.
//   counts_toward_sick_accrual      — State paid-sick-leave accrual, whose base is
//                                     defined by each state's own statute and is
//                                     narrower than either of the above.
//
// A PTO code with all three switched together gets ACA eligibility wrong, or pays
// overtime on hours nobody worked. The one-line explanation rides each switch.
//
// ── SEEDED CODES ───────────────────────────────────────────────────────────
// A seeded code can be DEACTIVATED but never deleted: an export written last quarter
// still references it, and a deleted code turns that export into a row of nulls.
//
// D11's tip codes ship `is_active = false` and this panel says **"seeded, not
// enabled"** — they exist so a tipped employer does not have to invent them, and stay
// off until that employer turns them on.
//
// ── DEDUCTION CODES ARE A REGISTRY ONLY ────────────────────────────────────
// Nothing in v1 computes a deduction. The panel says so out loud, because a list of
// deduction codes that looks like it is doing something is how an employer believes
// garnishments are being handled when they are not.

"use client";

import { useState } from "react";
import { Coins, Info, Loader2, Save, Sprout } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";

import { upsertHrStructure } from "../../service";
import { isHrDenied } from "../../types";
import { useHrContext } from "../../shared/useHrContext";
import { useHrSettingsStructure } from "../hooks/useHrSettingsStructure";
import { HrSettingsShell } from "../HrSettingsShell";
import type { HrDeductionCode, HrEarningCode } from "../types";

/** The three switches, with the sentence that keeps them from being flipped together. */
const INCLUSION_SWITCHES = [
  {
    key: "counts_toward_ot" as const,
    label: "Counts toward overtime",
    why: "FLSA overtime is owed on hours WORKED over forty in a workweek. Hours that were paid but not worked — holiday, PTO — normally do not count here.",
  },
  {
    key: "counts_toward_hours_of_service" as const,
    label: "Counts toward hours of service",
    why: "ACA and FMLA eligibility count hours for which someone is PAID or entitled to pay, worked or not. Paid leave normally does count here, even when it does not count toward overtime.",
  },
  {
    key: "counts_toward_sick_accrual" as const,
    label: "Counts toward sick accrual",
    why: "State paid-sick-leave laws each define their own accrual base, and it is usually narrower than either of the other two. Set this from the statute that applies, not by analogy.",
  },
];

export function HrCodesPanel() {
  const { active } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const { structure, isLoading, error, refresh } = useHrSettingsStructure(organizationId);

  return (
    <HrSettingsShell
      section="codes"
      title="Earning and deduction codes"
      description="What a timesheet line can be, and what a payroll export can carry."
      loading={isLoading}
      error={error}
      operation="This employer's earning and deduction codes"
      onRetry={refresh}
    >
      <div className="space-y-6 p-4 sm:p-6">
        <EarningCodesSection
          codes={structure?.earning_codes ?? []}
          organizationId={organizationId}
          onSaved={refresh}
        />
        <DeductionCodesSection
          codes={structure?.deduction_codes ?? []}
          organizationId={organizationId}
          onSaved={refresh}
        />
      </div>
    </HrSettingsShell>
  );
}

// ── Earning codes ───────────────────────────────────────────────────────────

function EarningCodesSection({
  codes,
  organizationId,
  onSaved,
}: {
  codes: HrEarningCode[];
  organizationId: string | null;
  onSaved: () => void;
}) {
  const columns: MatrxColumnDef<HrEarningCode>[] = [
    {
      id: "code",
      accessorKey: "code",
      header: "Code",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block font-mono text-sm font-medium text-foreground">
            {row.code}
          </span>
          <span className="block text-xs text-muted-foreground">{row.name}</span>
        </span>
      ),
    },
    {
      id: "category",
      accessorKey: "hours_category",
      header: "Hours category",
      filter: "select",
    },
    {
      id: "ot",
      accessorFn: (row) => (row.counts_toward_ot ? "Yes" : "No"),
      header: "→ Overtime",
      filter: "select",
      compact: true,
      align: "center",
      width: 90,
    },
    {
      id: "hos",
      accessorFn: (row) => (row.counts_toward_hours_of_service ? "Yes" : "No"),
      header: "→ Hours of service",
      filter: "select",
      compact: true,
      align: "center",
      width: 90,
    },
    {
      id: "sick",
      accessorFn: (row) => (row.counts_toward_sick_accrual ? "Yes" : "No"),
      header: "→ Sick accrual",
      filter: "select",
      compact: true,
      align: "center",
      width: 90,
    },
    {
      id: "status",
      accessorFn: (row) =>
        row.is_active ? "Enabled" : row.is_seeded ? "Seeded, not enabled" : "Disabled",
      header: "Status",
      filter: "select",
      cell: (row) => (
        <Badge
          variant={row.is_active ? "default" : row.is_seeded ? "secondary" : "outline"}
        >
          {row.is_active
            ? "Enabled"
            : row.is_seeded
              ? "Seeded, not enabled"
              : "Disabled"}
        </Badge>
      ),
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <Coins className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Earning codes</h2>
          <p className="text-sm text-muted-foreground">
            The three inclusion switches on each code answer three different legal
            questions, and a code routinely answers them differently. Open a code to see
            what each one means.
          </p>
        </div>
      </header>

      {codes.some((code) => code.is_seeded && !code.is_active) ? (
        <div className="flex items-start gap-2 border-b border-border px-4 pb-4">
          <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Codes marked <span className="font-medium">seeded, not enabled</span> were
            created for you and are switched off. Tip codes in particular ship this way:
            they exist so a tipped employer does not have to invent them, and they stay
            off — and out of every picker — until this employer turns them on.
          </p>
        </div>
      ) : null}

      <div className="p-4">
        <MatrxDataTable
          data={codes}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={25}
          urlState={{ id: "hr-earning-codes" }}
          toolbar={{ search: true, searchPlaceholder: "Search earning codes" }}
          emptyState={{
            title: "No earning codes yet",
            description:
              "Setup does not create any, so a timesheet has no vocabulary to write against. Regular, overtime and PTO are the three most employers start with.",
          }}
          detail={{
            title: (row) => `${row.code} — ${row.name}`,
            render: (row) => (
              <EarningCodeEditor
                code={row}
                organizationId={organizationId}
                onSaved={onSaved}
              />
            ),
          }}
        />
      </div>
    </section>
  );
}

function EarningCodeEditor({
  code,
  organizationId,
  onSaved,
}: {
  code: HrEarningCode;
  organizationId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(code.name);
  const [hoursCategory, setHoursCategory] = useState(code.hours_category);
  const [multiplier, setMultiplier] = useState(
    code.multiplier === null ? "" : String(code.multiplier),
  );
  const [switches, setSwitches] = useState({
    counts_toward_ot: code.counts_toward_ot,
    counts_toward_hours_of_service: code.counts_toward_hours_of_service,
    counts_toward_sick_accrual: code.counts_toward_sick_accrual,
  });
  const [externalMap, setExternalMap] = useState(() =>
    JSON.stringify(code.external_code_map ?? {}, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const save = async () => {
    if (!organizationId) return;
    let parsedMap: unknown;
    try {
      parsedMap = JSON.parse(externalMap) as unknown;
    } catch {
      setWhy("The external code map is not valid JSON.");
      return;
    }
    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "earning_code",
      payload: {
        id: code.id,
        organization_id: organizationId,
        name: name.trim(),
        hours_category: hoursCategory,
        multiplier: multiplier.trim() === "" ? null : Number(multiplier),
        ...switches,
        external_code_map: parsedMap,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success(`${code.code} is saved.`);
    onSaved();
  };

  const toggleActive = async () => {
    if (!organizationId) return;
    if (code.is_active) {
      const confirmed = await confirm({
        title: `Switch off ${code.code}?`,
        description:
          "It stops being offered on new timesheet lines. Everything already written " +
          "against it keeps it, and every past export still resolves — which is why a " +
          "code is switched off and never deleted." +
          (code.is_seeded
            ? " This is a seeded code, so switching off is the only option it has."
            : ""),
        confirmLabel: "Switch it off",
      });
      if (!confirmed) return;
    }
    setBusy(true);
    const result = await upsertHrStructure({
      kind: "earning_code",
      payload: {
        id: code.id,
        organization_id: organizationId,
        is_active: !code.is_active,
      },
    });
    setBusy(false);
    if (!result.ok) {
      // 🚨 The refusal that names the period. The server owns this check — an open
      // pay period referencing the code is a fact only it can see.
      setWhy(
        isHrDenied(result)
          ? result.detail ||
              `Switching this code off was refused (${result.reason}). An open pay period may still be using it.`
          : result.message,
      );
      return;
    }
    onSaved();
  };

  return (
    <div className="space-y-5 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="ec-name" className="text-sm font-medium">
          Name
        </Label>
        <Input id="ec-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ec-category" className="text-sm font-medium">
            Hours category
          </Label>
          <Input
            id="ec-category"
            value={hoursCategory}
            onChange={(e) => setHoursCategory(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ec-multiplier" className="text-sm font-medium">
            Multiplier
          </Label>
          <Input
            id="ec-multiplier"
            inputMode="decimal"
            value={multiplier}
            placeholder="1.5 for time-and-a-half"
            onChange={(e) => setMultiplier(e.target.value)}
          />
        </div>
      </div>

      {/* 🚨 The three switches, each with its own reason. */}
      <fieldset className="space-y-4 rounded-md border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">
          What these hours count toward
        </legend>
        {INCLUSION_SWITCHES.map((definition) => (
          <div key={definition.key} className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Switch
                id={`ec-${definition.key}`}
                checked={switches[definition.key]}
                disabled={busy}
                onCheckedChange={(next) =>
                  setSwitches((current) => ({ ...current, [definition.key]: next }))
                }
              />
              <Label htmlFor={`ec-${definition.key}`} className="text-sm font-medium">
                {definition.label}
              </Label>
            </div>
            <p className="pl-11 text-sm text-muted-foreground">{definition.why}</p>
          </div>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="ec-external" className="text-sm font-medium">
          External code map
        </Label>
        <Textarea
          id="ec-external"
          value={externalMap}
          rows={4}
          className="font-mono text-xs"
          onChange={(e) => setExternalMap(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          What this code is called in the system payroll is exported to — QuickBooks
          first. Keyed by provider, so one code can map to several.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="ec-active"
          checked={code.is_active}
          disabled={busy}
          onCheckedChange={toggleActive}
        />
        <Label htmlFor="ec-active" className="text-sm">
          Offered on new timesheet lines
        </Label>
      </div>

      {code.is_seeded ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Sprout className="mt-0.5 h-4 w-4 shrink-0" />
          This code was seeded for you. It can be switched off but never deleted —
          exports already written against it must keep resolving.
        </p>
      ) : null}

      {why ? (
        <p role="alert" className="text-sm text-destructive">
          {why}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={busy}
        className="min-h-11 sm:min-h-9"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save
      </Button>
    </div>
  );
}

// ── Deduction codes — a registry, and the panel says so ─────────────────────

function DeductionCodesSection({
  codes,
  organizationId,
  onSaved,
}: {
  codes: HrDeductionCode[];
  organizationId: string | null;
  onSaved: () => void;
}) {
  const columns: MatrxColumnDef<HrDeductionCode>[] = [
    {
      id: "code",
      accessorKey: "code",
      header: "Code",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block font-mono text-sm font-medium text-foreground">
            {row.code}
          </span>
          <span className="block text-xs text-muted-foreground">{row.name}</span>
        </span>
      ),
    },
    { id: "kind", accessorKey: "deduction_kind", header: "Kind", filter: "select" },
    {
      id: "provider",
      accessorKey: "provider_ref",
      header: "Provider reference",
      mobileHidden: true,
    },
    {
      id: "active",
      accessorFn: (row) => (row.is_active ? "Active" : "Inactive"),
      header: "Status",
      filter: "select",
      cell: (row) => (
        <Badge variant={row.is_active ? "secondary" : "outline"}>
          {row.is_active ? "Active" : "Inactive"}
        </Badge>
      ),
    },
  ];

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <Coins className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold text-foreground">Deduction codes</h2>
          <p className="text-sm text-muted-foreground">
            The names deductions are known by, for export.
          </p>
        </div>
      </header>

      {/* The honest statement that keeps this list from lying about what it does. */}
      <div className="flex items-start gap-2 border-b border-border px-4 pb-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">This is a registry, not a calculator.</span>{" "}
          Nothing in this system computes a deduction: no amounts, no garnishment
          maths, no benefit contributions. These codes exist so an export can name a
          deduction the receiving payroll system already knows how to compute.
        </p>
      </div>

      <div className="p-4">
        <MatrxDataTable
          data={codes}
          columns={columns}
          getRowId={(row) => row.id}
          pageSize={25}
          urlState={{ id: "hr-deduction-codes" }}
          toolbar={{ search: true, searchPlaceholder: "Search deduction codes" }}
          emptyState={{
            title: "No deduction codes yet",
            description:
              "Add them when a payroll export needs to name a deduction the receiving system computes.",
          }}
          detail={{
            title: (row) => `${row.code} — ${row.name}`,
            render: (row) => (
              <DeductionCodeEditor
                code={row}
                organizationId={organizationId}
                onSaved={onSaved}
              />
            ),
          }}
        />
      </div>
    </section>
  );
}

function DeductionCodeEditor({
  code,
  organizationId,
  onSaved,
}: {
  code: HrDeductionCode;
  organizationId: string | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(code.name);
  const [kind, setKind] = useState(code.deduction_kind);
  const [providerRef, setProviderRef] = useState(code.provider_ref ?? "");
  const [externalMap, setExternalMap] = useState(() =>
    JSON.stringify(code.external_code_map ?? {}, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);

  const save = async () => {
    if (!organizationId) return;
    let parsedMap: unknown;
    try {
      parsedMap = JSON.parse(externalMap) as unknown;
    } catch {
      setWhy("The external code map is not valid JSON.");
      return;
    }
    setBusy(true);
    setWhy(null);
    const result = await upsertHrStructure({
      kind: "deduction_code",
      payload: {
        id: code.id,
        organization_id: organizationId,
        name: name.trim(),
        deduction_kind: kind,
        provider_ref: providerRef.trim() || null,
        external_code_map: parsedMap,
      },
    });
    setBusy(false);
    if (!result.ok) {
      setWhy(
        isHrDenied(result)
          ? result.detail || `The server refused this change (${result.reason}).`
          : result.message,
      );
      return;
    }
    toast.success(`${code.code} is saved.`);
    onSaved();
  };

  return (
    <div className="space-y-4 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="dc-name" className="text-sm font-medium">
          Name
        </Label>
        <Input id="dc-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dc-kind" className="text-sm font-medium">
          Kind
        </Label>
        <Input id="dc-kind" value={kind} onChange={(e) => setKind(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dc-provider" className="text-sm font-medium">
          Provider reference
        </Label>
        <Input
          id="dc-provider"
          value={providerRef}
          onChange={(e) => setProviderRef(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="dc-external" className="text-sm font-medium">
          External code map
        </Label>
        <Textarea
          id="dc-external"
          value={externalMap}
          rows={4}
          className="font-mono text-xs"
          onChange={(e) => setExternalMap(e.target.value)}
        />
      </div>

      {why ? (
        <p role="alert" className="text-sm text-destructive">
          {why}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={busy}
        className="min-h-11 sm:min-h-9"
      >
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Save className="mr-2 h-4 w-4" />
        )}
        Save
      </Button>
    </div>
  );
}
