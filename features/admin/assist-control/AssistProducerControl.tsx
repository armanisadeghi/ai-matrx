"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import {
  listAssistProducerPolicies,
  updateAssistProducerPolicy,
  type AssistProducerPolicy,
} from "./service";

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

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="h-4 w-4 text-primary" />
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
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Producer</th>
              <th className="px-3 py-2 text-left">Destination</th>
              <th className="px-3 py-2 text-left">Audit</th>
              <th className="px-3 py-2 text-center">Produce</th>
              <th className="px-3 py-2 text-center">Present</th>
              <th className="px-3 py-2 text-right">Pending cap</th>
            </tr>
          </thead>
          <tbody>
            {(policies.data ?? []).map((row) => {
              const busy = saving === row.id;
              return (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.display_name}</div>
                    <code className="text-[10px] text-muted-foreground">
                      {row.source_pattern}
                      {row.match_kind === "prefix" ? "*" : ""}
                    </code>
                    <p className="mt-1 max-w-lg text-[11px] leading-snug text-muted-foreground">
                      {row.rationale}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{row.disposition}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1">
                      <History className="h-3 w-3" />
                      {row.audit_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Switch
                      checked={row.production_enabled}
                      disabled={busy}
                      aria-label={`Allow ${row.display_name} to produce`}
                      onCheckedChange={(checked) =>
                        void update(row, { production_enabled: checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <Switch
                      checked={row.presentation_enabled}
                      disabled={busy || row.disposition !== "assist"}
                      aria-label={`Allow ${row.display_name} in ambient presentation`}
                      onCheckedChange={(checked) =>
                        void update(row, { presentation_enabled: checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.max_pending_per_user}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
