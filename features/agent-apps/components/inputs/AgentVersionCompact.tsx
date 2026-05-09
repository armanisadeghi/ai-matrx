"use client";

/**
 * AgentVersionCompact
 *
 * Shows "v3" or "Latest" — period. Clicking "Change" opens a popover
 * with two simple choices:
 *   - Pick a specific version (radio list of available versions)
 *   - Always use the latest version
 *
 * Persists changes via two callbacks so the parent can decide whether
 * to write `agent_version_id` or `use_latest` (or both).
 */

import { useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  fetchAgentVersionHistory,
  type AgentVersionHistoryItem,
} from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { cn } from "@/lib/utils";

interface AgentVersionCompactProps {
  agentId: string;
  agentVersionId: string | null;
  useLatest: boolean;
  onAgentVersionIdChange: (next: string | null) => void;
  onUseLatestChange: (next: boolean) => void;
  disabled?: boolean;
}

export function AgentVersionCompact({
  agentId,
  agentVersionId,
  useLatest,
  onAgentVersionIdChange,
  onUseLatestChange,
  disabled,
}: AgentVersionCompactProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<AgentVersionHistoryItem[] | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const agent = useAppSelector((state) => selectAgentById(state, agentId));

  useEffect(() => {
    if (!open || !agentId || versions !== null || loading) return;
    setLoading(true);
    dispatch(fetchAgentVersionHistory({ agentId }))
      .unwrap()
      .then((rows) => setVersions(rows ?? []))
      .catch(() => setVersions([]))
      .finally(() => setLoading(false));
  }, [open, agentId, versions, loading, dispatch]);

  const currentVersion = useLatest
    ? null
    : (versions?.find((v) => v.version_id === agentVersionId) ?? null);

  const label = useLatest
    ? "Latest"
    : currentVersion
      ? `v${currentVersion.version_number}`
      : agentVersionId
        ? "—"
        : "—";

  const handlePinSpecific = (id: string) => {
    onUseLatestChange(false);
    onAgentVersionIdChange(id);
    setOpen(false);
  };

  const handleUseLatest = () => {
    onUseLatestChange(true);
    onAgentVersionIdChange(null);
    setOpen(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/30 border border-border/60">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          Version
        </span>
        <span className="text-sm font-mono font-medium text-foreground">
          {label}
        </span>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={disabled || !agentId}
          >
            Change
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[280px] p-2">
          <div className="space-y-1">
            <button
              type="button"
              onClick={handleUseLatest}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-left",
                useLatest && "bg-muted",
              )}
            >
              <span className="font-medium">Latest</span>
              {useLatest && (
                <span className="text-[10px] uppercase text-primary">
                  active
                </span>
              )}
            </button>
            <div className="border-t border-border my-1" />
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-2 pb-1">
              Specific version
            </div>
            {loading ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Loading…
              </div>
            ) : !versions || versions.length === 0 ? (
              <div className="px-2 py-2 text-xs text-muted-foreground">
                No versions yet.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                {versions.map((v) => {
                  const isActive =
                    !useLatest && v.version_id === agentVersionId;
                  return (
                    <button
                      key={v.version_id}
                      type="button"
                      onClick={() => handlePinSpecific(v.version_id)}
                      className={cn(
                        "w-full flex items-center justify-between px-2 py-1.5 rounded text-sm hover:bg-muted transition-colors text-left",
                        isActive && "bg-muted",
                      )}
                    >
                      <span className="font-mono">v{v.version_number}</span>
                      {v.changed_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(v.changed_at).toLocaleDateString()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
