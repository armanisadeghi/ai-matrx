"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  fetchAgentVersionHistory,
  type AgentVersionHistoryItem,
} from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";

const LATEST_VALUE = "__latest__";

/**
 * One row: "Version" label + a single dropdown that defaults to the
 * agent's actual current version. The user never has to click "pin to
 * current" — that's already done. Picking "Always Latest" surfaces an
 * inline warning right below the dropdown.
 */
export function CompactVersionPicker({
  agentId,
  agentVersionId,
  useLatest,
  onAgentVersionIdChange,
  onUseLatestChange,
  disabled,
}: {
  agentId: string;
  agentVersionId: string | null;
  useLatest: boolean;
  onAgentVersionIdChange: (next: string | null) => void;
  onUseLatestChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const dispatch = useAppDispatch();
  const agent = useAppSelector((s) => selectAgentById(s, agentId));
  const liveVersionNumber = agent?.version ?? null;

  const [versions, setVersions] = useState<AgentVersionHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoading(true);
    dispatch(fetchAgentVersionHistory({ agentId, limit: 50, offset: 0 }))
      .unwrap()
      .then((items) => {
        if (cancelled) return;
        const sorted = [...items].sort(
          (a, b) => b.version_number - a.version_number,
        );
        setVersions(sorted);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load versions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dispatch, agentId]);

  // Identify the current version row (the one matching the live agent's
  // version number). It's the default pin target.
  const currentRow =
    liveVersionNumber != null
      ? versions.find((v) => v.version_number === liveVersionNumber)
      : versions[0];

  // Auto-pin to current the first time we have data, if the parent
  // hasn't already chosen a version and isn't on Always Latest.
  useEffect(() => {
    if (useLatest) return;
    if (agentVersionId) return;
    if (!currentRow) return;
    onAgentVersionIdChange(currentRow.version_id);
  }, [useLatest, agentVersionId, currentRow, onAgentVersionIdChange]);

  const selectValue = useLatest
    ? LATEST_VALUE
    : (agentVersionId ?? currentRow?.version_id ?? "");

  const onValueChange = (next: string) => {
    if (next === LATEST_VALUE) {
      onUseLatestChange(true);
      onAgentVersionIdChange(null);
      return;
    }
    onUseLatestChange(false);
    onAgentVersionIdChange(next);
  };

  const renderLabelFor = (row: AgentVersionHistoryItem) => {
    const isCurrent =
      liveVersionNumber != null && row.version_number === liveVersionNumber;
    return (
      <span className="flex items-center gap-1.5">
        <span>V{row.version_number}</span>
        {isCurrent && (
          <span className="text-[10px] text-muted-foreground">current</span>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={onValueChange}
        disabled={disabled || loading || versions.length === 0}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue
            placeholder={
              loading
                ? "Loading…"
                : versions.length === 0
                  ? "No versions yet"
                  : "Pick a version"
            }
          />
        </SelectTrigger>
        <SelectContent>
          {versions.map((v) => (
            <SelectItem key={v.version_id} value={v.version_id}>
              {renderLabelFor(v)}
            </SelectItem>
          ))}
          <SelectItem value={LATEST_VALUE}>
            <span className="text-amber-700 dark:text-amber-400">
              Always Latest
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      {error && (
        <p className="text-[11px] text-destructive">{error}</p>
      )}

      {useLatest && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            This shortcut will always run the agent&rsquo;s latest version.
            Changes to the agent could break this shortcut without warning.
          </span>
        </div>
      )}
    </div>
  );
}
