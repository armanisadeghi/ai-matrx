"use client";

// "Runs on protected accounts" — automated work that ran as, or billed, admin@admin.com or
// Arman's account (spend rules §6, Arman 2026-10-08: nothing for the core system is associated
// with either account). Reads platform.protected_account_runs(hours) — the same function the
// aidream guard scripts/check_no_automated_work_on_protected_accounts.py reads.

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Badge, Button } from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { pgErrorToError } from "@ai-matrx/data";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/utils/supabase/client";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import type { SpendWindowDays } from "./agentSpend";

export interface ProtectedAccountRun {
  email: string;
  driver: string;
  subject: string;
  origin: string;
  runs: number;
  cost: number;
  last_at: string;
}

export async function fetchProtectedAccountRuns(days: SpendWindowDays): Promise<ProtectedAccountRun[]> {
  const { data, error } = await supabase.schema("platform").rpc("protected_account_runs", { p_hours: days * 24 });
  if (error) throw pgErrorToError(error);
  return (data ?? []).map((r) => ({ ...r, runs: Number(r.runs), cost: Number(r.cost) }));
}

const rowKey = (r: ProtectedAccountRun) => `${r.email}|${r.driver}|${r.subject}|${r.origin}`;

/** Toolbar control: the count, opening the rows. Admin seat only. */
export function ProtectedAccountRunsButton({ days }: { days: SpendWindowDays }) {
  const { format } = useCostDisplay();
  const [rows, setRows] = useState<ProtectedAccountRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    fetchProtectedAccountRuns(days)
      .then((r) => live && setRows(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [days]);

  const runs = rows?.reduce((s, r) => s + r.runs, 0) ?? 0;
  const cost = rows?.reduce((s, r) => s + r.cost, 0) ?? 0;
  const columns: MatrxColumnDef<ProtectedAccountRun>[] = [
    { id: "email", accessorKey: "email", header: "Account", filter: "text", width: 200 },
    { id: "driver", accessorKey: "driver", header: "Started by", filter: "text", width: 120 },
    { id: "subject", accessorKey: "subject", header: "Subject", filter: "text", width: 240 },
    { id: "origin", accessorKey: "origin", header: "Origin", filter: "text", width: 110 },
    {
      id: "runs",
      accessorKey: "runs",
      header: "Runs",
      filter: "number",
      align: "right",
      width: 80,
      cell: (r) => <span className="tabular-nums text-xs">{r.runs.toLocaleString()}</span>,
    },
    {
      id: "cost",
      accessorKey: "cost",
      header: "Cost",
      filter: "number",
      align: "right",
      width: 100,
      cell: (r) => <span className="tabular-nums text-xs">{format(r.cost)}</span>,
    },
    {
      id: "last_at",
      accessorKey: "last_at",
      header: "Last run",
      filter: "date",
      width: 160,
      cell: (r) => <span className="text-xs">{new Date(r.last_at).toLocaleString()}</span>,
    },
  ];

  const label = error ? "Protected accounts: unreadable" : rows == null ? "Protected accounts" : `Protected accounts: ${runs.toLocaleString()} runs, ${format(cost)}`;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} disabled={rows == null && !error} aria-label={label} title={error ?? label}>
        <ShieldAlert className="h-4 w-4" />
        <Badge tone={error ? "destructive" : runs > 0 ? "destructive" : "success"}>
          {error ? "!" : rows == null ? "…" : runs.toLocaleString()}
        </Badge>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="2xl" height="tall">
          <DialogTitle>Runs on protected accounts, {days} days</DialogTitle>
          {error ? (
            <div className="text-sm text-destructive">{error}</div>
          ) : (
            <div className="min-h-0 flex-1">
              <MatrxDataTable
                data={rows ?? []}
                columns={columns}
                getRowId={rowKey}
                isLoading={rows == null}
                defaultSort={{ id: "cost", direction: "desc" }}
                emptyState={{ title: "No automated runs on protected accounts" }}
                drill={{ local: true }}
                copy={{
                  label: "Runs on protected accounts",
                  listLabel: "Runs on protected accounts",
                  location: "/administration/usage/agents",
                  rowKind: "protected-account-run",
                  listKind: "protected-account-run",
                  humanRow: (r) =>
                    `${r.email} · ${r.driver} · ${r.subject} · ${r.origin} · ${r.runs} runs · ${format(r.cost)}`,
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
