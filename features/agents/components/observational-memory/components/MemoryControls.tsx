"use client";

/**
 * MemoryControls
 *
 * Admin-only controls for enabling / disabling / configuring Observational
 * Memory on a conversation. The toggle is a one-shot Redux flag — once set,
 * the next outbound turn (see execute-instance thunk) will send
 * `memory: true|false` plus the selected model/scope.
 *
 * For unpersisted conversations (no turns yet), the toggle is still queued —
 * it rides the first turn and the backend persists the metadata from there.
 *
 * For persisted conversations (server has sent back an observational_memory
 * metadata block), we reflect the authoritative state from Redux and the
 * toggle becomes an "update" instead of a "set".
 */

import React, { useCallback } from "react";
import { Beaker } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  requestMemoryToggle,
  setMemoryModel,
  setMemoryScope,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import {
  selectIsMemoryToggleRequested,
  selectMemoryModel,
  selectMemoryScope,
  selectMemoryToggleTarget,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import {
  selectIsMemoryEnabledForConversation,
  selectMemoryMetadata,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import { ModelListDropdown } from "@/features/ai-models/components/lab/ModelListDropdown";
import { useModels } from "@/features/ai-models/hooks/useModels";

/**
 * Curated list of models known to work well for Observer / Reflector.
 * Kept small + opinionated — if we need more freedom, we can swap to a
 * free-text input later.
 */
const MEMORY_MODEL_NAMES: readonly string[] = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-5-mini",
  "openai/gpt-5-nano",
  "claude-haiku-4-5",
];

interface MemoryControlsProps {
  conversationId: string;
  /** Compact variant for the Creator Run Panel's Settings tab. */
  variant?: "default" | "compact";
  className?: string;
}

export function MemoryControls({
  conversationId,
  variant = "default",
  className,
}: MemoryControlsProps) {
  const dispatch = useAppDispatch();

  const isPersistedEnabled = useAppSelector(
    selectIsMemoryEnabledForConversation(conversationId),
  );
  const persistedMeta = useAppSelector(selectMemoryMetadata(conversationId));

  const toggleRequested = useAppSelector(selectIsMemoryToggleRequested);
  const toggleTarget = useAppSelector(selectMemoryToggleTarget);
  const memoryModel = useAppSelector(selectMemoryModel);
  const memoryScope = useAppSelector(selectMemoryScope);
  const { models } = useModels();
  const eligibleMemoryModels = models.filter((model) =>
    MEMORY_MODEL_NAMES.includes(model.name),
  );
  const memoryModelId =
    eligibleMemoryModels.find((model) => model.name === memoryModel)?.id ??
    null;

  // Effective shown state — pending toggle beats persisted state.
  const effectiveEnabled = toggleRequested
    ? toggleTarget
    : isPersistedEnabled;

  const handleToggle = useCallback(
    (enabled: boolean) => {
      dispatch(requestMemoryToggle({ enabled }));
    },
    [dispatch],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      dispatch(setMemoryModel(value === "" ? null : value));
    },
    [dispatch],
  );

  const handleScopeChange = useCallback(
    (value: "thread" | "resource") => {
      dispatch(setMemoryScope(value));
    },
    [dispatch],
  );

  const isCompact = variant === "compact";

  return (
    <div className={cn("space-y-2", className)}>
      {!isCompact && (
        <div className="flex items-center gap-2">
          <Beaker className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Observational Memory (admin)
          </span>
        </div>
      )}

      <div className="flex items-center justify-between py-1">
        <div className="min-w-0">
          <Label
            htmlFor={`mem-toggle-${conversationId}`}
            className="text-xs text-muted-foreground cursor-pointer"
          >
            Memory for this conversation
          </Label>
          {!isCompact && (
            <div className="text-[10px] text-muted-foreground/70 mt-0.5">
              Observer + Reflector run in background. Cost separate from turn.
            </div>
          )}
        </div>
        <Switch
          id={`mem-toggle-${conversationId}`}
          checked={effectiveEnabled}
          onCheckedChange={handleToggle}
          className="scale-75 origin-right"
        />
      </div>

      {toggleRequested && (
        <div
          className={cn(
            "text-[10px] rounded px-2 py-1 border",
            toggleTarget
              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400",
          )}
        >
          {toggleTarget ? "Enable" : "Disable"} queued — rides the next turn.
        </div>
      )}

      {!isCompact && persistedMeta && (
        <div className="text-[10px] text-muted-foreground space-y-0.5 rounded bg-muted/10 px-2 py-1.5 border border-border/50">
          <div className="flex justify-between">
            <span>Persisted</span>
            <span
              className={cn(
                "font-mono",
                persistedMeta.enabled
                  ? "text-emerald-500"
                  : "text-muted-foreground",
              )}
            >
              {persistedMeta.enabled ? "enabled" : "disabled"}
            </span>
          </div>
          {persistedMeta.model && (
            <div className="flex justify-between">
              <span>Model</span>
              <span className="font-mono text-foreground truncate ml-2">
                {persistedMeta.model}
              </span>
            </div>
          )}
          {persistedMeta.scope && (
            <div className="flex justify-between">
              <span>Scope</span>
              <span className="font-mono text-foreground">
                {persistedMeta.scope}
              </span>
            </div>
          )}
        </div>
      )}

      {!isCompact && <Separator className="!my-2" />}

      {/* Model + scope selectors (only meaningful when enabling) */}
      <div
        className={cn(
          "space-y-1.5",
          !toggleRequested && !isPersistedEnabled && "opacity-60",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">
            Model override
          </Label>
          <ModelListDropdown
            value={memoryModelId}
            onValueChange={(modelId) => {
              const selectedModel = eligibleMemoryModels.find(
                (model) => model.id === modelId,
              );
              if (selectedModel) handleModelChange(selectedModel.name);
            }}
            inputModalities={["text"]}
            outputModalities={["text"]}
            allowedModelIds={eligibleMemoryModels.map((model) => model.id)}
            emptyOptionLabel="Default observational-memory model"
            onClear={() => handleModelChange("")}
            className="h-6 max-w-[240px] flex-1 text-[11px]"
          />
        </div>

        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">
            Scope
          </Label>
          <div className="flex rounded border border-input bg-background overflow-hidden">
            <ScopeButton
              active={memoryScope === "thread"}
              onClick={() => handleScopeChange("thread")}
            >
              thread
            </ScopeButton>
            <ScopeButton
              active={memoryScope === "resource"}
              onClick={() => handleScopeChange("resource")}
            >
              resource
            </ScopeButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-0.5 text-[11px] font-mono transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  );
}
