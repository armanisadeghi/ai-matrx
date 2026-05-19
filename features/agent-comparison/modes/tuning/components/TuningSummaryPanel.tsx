"use client";

/**
 * TuningSummaryPanel
 *
 * Inline summary of the column's currently-tuned model + settings, with
 * an "Edit settings" button that opens the same `AgentSettingsModal`
 * the Agent Builder uses — pointed at the column's synthetic agent
 * record.
 *
 * Why inline summary + modal (not inline full editor): the Builder
 * settings panel renders model-aware widgets (8+ inputs depending on
 * model), too tall for a comparison column. The inline summary lets
 * the user scan-compare what each column is configured with; the modal
 * gives them the full UI when they want to change something.
 */

import { useEffect } from "react";
import { Cpu, SlidersHorizontal } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentSettings,
  selectAgentModelId,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  selectModelById,
  selectModelRegistryLoading,
} from "@/features/ai-models/redux/modelRegistrySlice";
import { fetchModelOptions } from "@/features/ai-models/redux/modelRegistrySlice";
import { AgentSettingsModal } from "@/features/agents/components/settings-management/AgentSettingsModal";

interface Props {
  syntheticAgentId: string;
}

/**
 * Settings keys that surface as inline pills. Kept short (4 max) so
 * narrow columns aren't overwhelmed; the full settings list lives in
 * the modal.
 */
const SUMMARY_KEYS: Array<{ key: string; label: string }> = [
  { key: "temperature", label: "T" },
  { key: "reasoning_effort", label: "re" },
  { key: "thinking_level", label: "tl" },
  { key: "max_output_tokens", label: "max" },
];

export function TuningSummaryPanel({ syntheticAgentId }: Props) {
  const dispatch = useAppDispatch();

  const modelId = useAppSelector((s) =>
    selectAgentModelId(s, syntheticAgentId),
  ) as string | null | undefined;
  const settings = useAppSelector((s) =>
    selectAgentSettings(s, syntheticAgentId),
  );

  const registryLoading = useAppSelector(selectModelRegistryLoading);
  const modelRow = useAppSelector((s) =>
    modelId ? selectModelById(s, modelId) : undefined,
  );

  useEffect(() => {
    if (!registryLoading && !modelRow && modelId) {
      // Cold model — the row isn't loaded yet. The modal will fetch on
      // open, but we also want the inline name to resolve.
      dispatch(fetchModelOptions());
    }
  }, [registryLoading, modelRow, modelId, dispatch]);

  const settingsObj = (settings ?? {}) as Record<string, unknown>;
  const summaryPills = SUMMARY_KEYS.flatMap((s) => {
    const v = settingsObj[s.key];
    if (v == null) return [];
    return [
      {
        key: s.key,
        text: `${s.label}=${typeof v === "number" ? formatNumber(v) : String(v)}`,
      },
    ];
  });

  return (
    <div className="h-full overflow-y-auto p-2 space-y-2">
      <div className="flex items-center justify-between sticky top-0 bg-background py-1">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tuning
          </span>
        </div>
        <AgentSettingsModal agentId={syntheticAgentId} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline gap-1.5 px-1.5 py-1 rounded bg-muted/40">
          <Cpu className="w-3 h-3 text-primary self-center shrink-0" />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">
            Model
          </span>
          <span className="text-[11px] font-medium text-foreground truncate flex-1 min-w-0">
            {modelRow?.common_name ?? modelRow?.name ?? modelId ?? "(none)"}
          </span>
        </div>

        {summaryPills.length > 0 && (
          <div className="flex flex-wrap gap-1 px-1">
            {summaryPills.map((p) => (
              <span
                key={p.key}
                className="inline-flex items-center px-1.5 h-5 rounded bg-primary/10 text-primary text-[10px] font-mono"
              >
                {p.text}
              </span>
            ))}
          </div>
        )}

        {summaryPills.length === 0 && (
          <div className="text-[10px] text-muted-foreground/70 italic px-1.5">
            Using agent defaults. Click the sliders icon to tune model
            settings.
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}
