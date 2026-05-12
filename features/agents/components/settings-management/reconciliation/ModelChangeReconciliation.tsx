"use client";

/**
 * ModelChangeReconciliation — dialog that resolves setting incompatibilities
 * when the user changes an agent's model.
 *
 * Opened BEFORE the modelId change is committed. If the user confirms, a
 * single commit both dispatches the model change and the reconciled settings.
 * If the user cancels, nothing is dispatched — the model stays on the old id.
 *
 * Top bar offers bulk actions (use new defaults / keep mine / clear / fix).
 * The per-row table lets the user override the suggested action for any key.
 */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { FeLlmParams } from "@/features/agents/types/agent-api-types";
import {
  applyReconciliation,
  type ModelChangePlan,
  type ReconcileAction,
  type IncompatibleRow,
} from "./analyze";

interface ModelChangeReconciliationProps {
  isOpen: boolean;
  onClose: () => void;
  oldModelName: string;
  newModelName: string;
  oldSettings: FeLlmParams;
  plan: ModelChangePlan;
  /** Dispatches both modelId change and reconciled settings in the same tick. */
  onCommit: (nextSettings: FeLlmParams) => void;
}

const ISSUE_LABEL: Record<IncompatibleRow["issue"], string> = {
  "unsupported-key": "Not supported by new model",
  "invalid-enum": "Not an allowed value",
  "out-of-range": "Outside the allowed range",
  "type-mismatch": "Wrong type",
  "coupling-broken": "Requires a coupled setting",
  forbidden: "Not allowed on this model",
  deprecated: "Deprecated key",
  schema: "Wrong shape",
  other: "Incompatible",
};

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function ModelChangeReconciliation({
  isOpen,
  onClose,
  oldModelName,
  newModelName,
  oldSettings,
  plan,
  onCommit,
}: ModelChangeReconciliationProps) {
  const isMobile = useIsMobile();

  // Per-row action overrides. Initially empty → each row uses its suggestedAction.
  const [actionsByKey, setActionsByKey] = useState<
    Record<string, ReconcileAction>
  >({});
  const [previewOpen, setPreviewOpen] = useState(false);

  // Reset overrides whenever the dialog re-opens for a new plan.
  useEffect(() => {
    if (isOpen) setActionsByKey({});
  }, [isOpen, plan]);

  const resolvedActions = useMemo(() => {
    const out: Record<string, ReconcileAction> = {};
    for (const row of plan.incompatible) {
      out[row.key] = actionsByKey[row.key] ?? row.suggestedAction;
    }
    return out;
  }, [actionsByKey, plan]);

  const previewSettings = useMemo(
    () => applyReconciliation(plan, resolvedActions),
    [plan, resolvedActions],
  );

  const handleRowAction = (key: string, action: ReconcileAction) => {
    setActionsByKey((prev) => ({ ...prev, [key]: action }));
  };

  // ── Global action handlers ───────────────────────────────────────────────
  const handleApplySuggested = () => {
    // Use the currently-resolved actions (user overrides or suggestions).
    onCommit(previewSettings);
  };

  const handleUseNewDefaults = () => {
    onCommit(plan.newModelDefaults);
  };

  const handleKeepMine = () => {
    // Keep every current setting — both compatible and incompatible-as-is.
    const kept: Record<string, unknown> = {
      ...(plan.compatibleSettings as Record<string, unknown>),
    };
    for (const row of plan.incompatible) {
      kept[row.key] = row.currentValue;
    }
    onCommit(kept as FeLlmParams);
  };

  const handleClearAll = () => {
    onCommit({} as FeLlmParams);
  };

  const handleFixIncompatibleOnly = () => {
    // Suggested action for every incompatible row, ignoring user overrides.
    onCommit(applyReconciliation(plan, {}));
  };

  // ── Content ──────────────────────────────────────────────────────────────
  const count = plan.incompatible.length;

  const body = (
    <div className="flex flex-col gap-3">
      {/* Global actions */}
      <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleFixIncompatibleOnly}
          title="Apply the suggested action for each incompatible setting; keep compatible ones as-is"
        >
          Fix incompatibilities only
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleUseNewDefaults}
          title="Drop all current settings, use the new model's defaults"
        >
          Use new model defaults
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleKeepMine}
          title="Commit the model change but keep every current setting — warnings will show"
        >
          Keep my settings
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs text-destructive hover:text-destructive"
          onClick={handleClearAll}
          title="Wipe all settings to empty"
        >
          Clear all
        </Button>
      </div>

      {/* Per-row table */}
      <div className="rounded border border-border overflow-hidden">
        <div className="grid grid-cols-[minmax(140px,1fr)_minmax(110px,1fr)_minmax(160px,1.2fr)_minmax(110px,1fr)_160px] items-center gap-2 px-2.5 py-1.5 bg-muted/60 border-b border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Setting</span>
          <span>Current value</span>
          <span>Issue</span>
          <span>New model default</span>
          <span className="text-right">Action</span>
        </div>

        <ScrollArea className="max-h-[40dvh]">
          {plan.incompatible.map((row, idx) => {
            const isLast = idx === plan.incompatible.length - 1;
            const action = resolvedActions[row.key];
            const defaultAvailable = row.newModelDefault !== undefined;
            return (
              <div
                key={row.key}
                className={`grid grid-cols-[minmax(140px,1fr)_minmax(110px,1fr)_minmax(160px,1.2fr)_minmax(110px,1fr)_160px] items-center gap-2 px-2.5 py-1.5 ${
                  !isLast ? "border-b border-border" : ""
                }`}
              >
                <span className="font-mono text-xs truncate" title={row.key}>
                  {row.key}
                </span>
                <span
                  className="font-mono text-xs text-muted-foreground truncate"
                  title={formatValue(row.currentValue)}
                >
                  {formatValue(row.currentValue)}
                </span>
                <span className="text-xs text-foreground/80 leading-snug">
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {ISSUE_LABEL[row.issue]}
                  </span>
                  {row.issueMessage ? (
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {row.issueMessage}
                    </span>
                  ) : null}
                </span>
                <span
                  className="font-mono text-xs text-muted-foreground truncate"
                  title={formatValue(row.newModelDefault)}
                >
                  {formatValue(row.newModelDefault)}
                </span>
                <div className="flex justify-end">
                  <Select
                    value={action}
                    onValueChange={(v) =>
                      handleRowAction(row.key, v as ReconcileAction)
                    }
                  >
                    <SelectTrigger className="h-7 text-xs w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="text-xs">
                      <SelectItem
                        value="swap-to-default"
                        disabled={!defaultAvailable}
                      >
                        Swap to default
                      </SelectItem>
                      <SelectItem value="clear">Clear</SelectItem>
                      <SelectItem value="keep">Keep as-is</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </ScrollArea>
      </div>

      {/* Preview panel */}
      <div className="rounded border border-border">
        <button
          type="button"
          onClick={() => setPreviewOpen((v) => !v)}
          className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/40"
        >
          {previewOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          Preview settings after apply
          <span className="ml-auto text-[10px] text-muted-foreground">
            {Object.keys(previewSettings).length} key
            {Object.keys(previewSettings).length !== 1 ? "s" : ""}
          </span>
        </button>
        {previewOpen && (
          <pre className="text-[11px] font-mono leading-5 p-3 overflow-auto max-h-[30dvh] bg-zinc-50 dark:bg-zinc-900 border-t border-border">
            {JSON.stringify(previewSettings, null, 2)}
          </pre>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <Button variant="outline" onClick={onClose} className="h-8">
          Cancel
        </Button>
        <Button onClick={handleApplySuggested} className="h-8">
          Apply & switch model
        </Button>
      </div>
    </div>
  );

  const title = `Switching to ${newModelName}`;
  const description = `${count} setting${count !== 1 ? "s" : ""} from ${oldModelName} need${count === 1 ? "s" : ""} review.`;

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="px-3 pb-safe max-h-[92dvh]">
          <DrawerHeader className="px-0 pb-2">
            <DrawerTitle className="text-base">{title}</DrawerTitle>
            <DrawerDescription className="text-xs">
              {description}
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="flex-1 overflow-y-auto">{body}</ScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[90dvh] overflow-hidden flex flex-col p-4">
        <DialogHeader>
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">
            {description}
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 overflow-y-auto pr-1">{body}</ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
