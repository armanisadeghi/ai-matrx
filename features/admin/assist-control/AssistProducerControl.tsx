"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, BrainCircuit } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import {
  listAssistProducerPolicies,
  updateAssistProducerPolicy,
  type AssistProducerPolicy,
} from "./service";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function AssistProducerControl() {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const policies = useQuery({
    queryKey: ["admin", "assist-producer-policy"],
    queryFn: listAssistProducerPolicies,
  });

  const update = async (
    row: AssistProducerPolicy,
    patch: Parameters<typeof updateAssistProducerPolicy>[1],
  ) => {
    const why = reason.trim();
    if (!why) {
      toast.error("Add a change reason first — every switch is recorded.");
      return;
    }
    setSaving(row.id);
    try {
      await updateAssistProducerPolicy(row, patch, why);
      await policies.refetch();
      toast.success("Assist policy updated. The change is reversible.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update policy",
      );
    } finally {
      setSaving(null);
    }
  };

  const columns: MatrxColumnDef<AssistProducerPolicy>[] = [
    {
      id: "producer",
      header: "Producer",
      accessorFn: (row) => `${row.display_name} ${row.source_pattern} ${row.rationale}`,
      width: 360,
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{row.display_name}</div>
          <code className="block truncate text-[10px] text-muted-foreground">
            {row.source_pattern}{row.match_kind === "prefix" ? "*" : ""}
          </code>
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {row.rationale}
          </p>
        </div>
      ),
    },
    {
      id: "disposition",
      accessorKey: "disposition",
      header: "Destination",
      filter: "select",
      width: 130,
      cell: (row) => <Badge variant="outline">{row.disposition}</Badge>,
    },
    {
      id: "audit_status",
      accessorKey: "audit_status",
      header: "Audit",
      filter: "select",
      width: 150,
      cell: (row) => <span className="inline-flex items-center gap-1"><History className="h-3 w-3" />{row.audit_status}</span>,
    },
    {
      id: "production_enabled",
      accessorKey: "production_enabled",
      header: "Produce",
      filter: "boolean",
      width: 105,
      cell: (row) => {
        const busy = saving === row.id;
        return <Switch checked={row.production_enabled} disabled={busy} aria-label={`Allow ${row.display_name} to produce`} onCheckedChange={(checked) => void update(row, { production_enabled: checked })} />;
      },
    },
    {
      id: "presentation_enabled",
      accessorKey: "presentation_enabled",
      header: "Present",
      filter: "boolean",
      width: 105,
      cell: (row) => {
        const busy = saving === row.id;
        return <Switch checked={row.presentation_enabled} disabled={busy || row.disposition !== "assist"} aria-label={`Allow ${row.display_name} in ambient presentation`} onCheckedChange={(checked) => void update(row, { presentation_enabled: checked })} />;
      },
    },
    {
      id: "max_pending_per_user",
      accessorKey: "max_pending_per_user",
      header: "Pending cap",
      filter: "number",
      width: 120,
      cell: (row) => <span className="tabular-nums">{row.max_pending_per_user}</span>,
    },
  ];

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <BrainCircuit className="h-4 w-4 text-primary" />
            Assist producer controls
          </h2>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Production controls whether the producer may do Assist-specific
            work. Presentation controls whether its rows can compete for one of
            the three ambient slots. Turning either back on restores the
            implementation; no producer code or history is deleted.
          </p>
        </div>
        <label className="w-full max-w-md text-xs text-muted-foreground">
          Change reason
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why are you changing these controls?"
            className="mt-1 h-8 text-xs"
          />
        </label>
      </div>

      {policies.error && (
        <p className="text-sm text-destructive">
          {policies.error instanceof Error
            ? policies.error.message
            : "Could not load Assist controls"}
          <ErrorAlchemyMenu error={policies.error.message} />
        </p>
      )}

      <MatrxDataTable
        urlState={{ id: "assist-producer-controls" }}
        data={policies.data ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        isLoading={policies.isPending}
        isFetching={policies.isFetching}
        pageSize={25}
        emptyState={{ title: "No Assist producer controls" }}
        toolbar={{ search: true, searchPlaceholder: "Search producer controls…" }}
        detail={{ enabled: false }}
      />
    </section>
  );
}
