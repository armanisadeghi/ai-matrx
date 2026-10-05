"use client";

// row-token: none — rows are switch presses (platform.cutover_seam_press), an audit record with no registry token

// features/administration/switch-presses/SwitchPressHistory.tsx — THE SWITCH'S PRESS HISTORY.
//
// /administration/database/switch-presses (lane ONE-HOME, wave 4 after the soak). The Final switch
// and Unified data ramp screens left with the switch machinery; their record stays readable here:
// every press of every old → new switch (the final switch, its undo's retirement, each organization's
// data tables and scope screens, Copy again runs), newest first, read through the platform admin's
// one door `platform.cutover_press_history` (the press rows themselves have no client grant).
// Read only: nothing on this page presses anything.

import { useEffect, useState } from "react";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
import { createClient } from "@/utils/supabase/client";
import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";
import { adminPageCapture } from "@/components/agent-copy/page-capture/pageCapture";

export type SwitchPress = {
  id: string;
  seam_key: string;
  organization_id: string | null;
  direction: string;
  outcome: string;
  refusal: string | null;
  says: string | null;
  pressed_by: string | null;
  pressed_at: string;
  note: string | null;
};

/** How many presses one read brings (the record holds a few thousand; newest first). */
export const PRESS_HISTORY_LIMIT = 5000;

export async function readSwitchPresses(): Promise<SwitchPress[]> {
  const platform = createClient().schema("platform" as never) as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
  const { data, error } = await platform.rpc("cutover_press_history", { p_limit: PRESS_HISTORY_LIMIT });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as SwitchPress[]) : [];
}

const when = (iso: string) => new Date(iso).toLocaleString();

export function SwitchPressHistory() {
  const [rows, setRows] = useState<SwitchPress[] | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setReadError(null);
    readSwitchPresses().then(
      (r) => live && setRows(r),
      (e: unknown) => {
        if (!live) return;
        setRows([]);
        setReadError(e instanceof Error ? e.message : String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [nonce]);

  usePageCapture(() =>
    adminPageCapture({
      title: "Switch presses",
      route: "/administration/database/switch-presses",
      errors: [readError],
      sections: [{ id: "switch-presses", title: "Switch presses", role: "data", value: rows ?? "Loading." }],
    }),
  );

  const columns: MatrxColumnDef<SwitchPress>[] = [
    { id: "pressed_at", header: "When", width: 180, accessorFn: (r) => r.pressed_at, cell: (r) => <span className="tabular-nums">{when(r.pressed_at)}</span> },
    { id: "seam", header: "Switch", width: 190, accessorFn: (r) => r.seam_key, cell: (r) => <span className="block truncate font-mono text-xs">{r.seam_key}</span> },
    { id: "direction", header: "To", width: 70, accessorFn: (r) => r.direction },
    { id: "outcome", header: "Outcome", width: 100, accessorFn: (r) => r.outcome },
    { id: "organization", header: "Organization", width: 300, accessorFn: (r) => r.organization_id ?? "", cell: (r) => <span className="block truncate font-mono text-xs">{r.organization_id ?? "—"}</span> },
    { id: "says", header: "Said", width: 420, accessorFn: (r) => r.refusal ?? r.says ?? "", cell: (r) => <span className="block truncate">{r.refusal ?? r.says ?? "—"}</span> },
    { id: "note", header: "Note", width: 260, accessorFn: (r) => r.note ?? "", cell: (r) => <span className="block truncate text-muted-foreground">{r.note ?? "—"}</span> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <MatrxDataTable
        tableId="admin-switch-presses"
        data={rows ?? []}
        columns={columns}
        getRowId={(r) => r.id}
        isLoading={rows === null}
        read={{ status: rows === null ? "loading" : readError ? "error" : "ready", error: readError, onRetry: () => setNonce((n) => n + 1), what: "presses" }}
        emptyState={{ title: "No presses" }}
        detail={{ enabled: false }}
        coverage={{ noun: "press", total: rows?.length ?? 0, answeredBy: "client" }}
        toolbar={{ title: "Switch presses", refresh: { onRefresh: () => setNonce((n) => n + 1) } }}
      />
    </div>
  );
}
