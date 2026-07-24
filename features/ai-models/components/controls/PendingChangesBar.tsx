"use client";

/**
 * Sticky batch-save bar for the structured Controls editor. Summarizes pending
 * drafts per destination and commits them in ONE action: at most one
 * updateOffering + one updateApi, then a single catalog reload.
 */

import React from "react";
import { AlertTriangle, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PendingChangesBarProps {
  overrideKeys: string[];
  familyKeys: string[];
  familyModelCount: number;
  apiName: string | null;
  saving: boolean;
  onSave: () => void;
  onDiscardAll: () => void;
}

export default function PendingChangesBar({
  overrideKeys,
  familyKeys,
  familyModelCount,
  apiName,
  saving,
  onSave,
  onDiscardAll,
}: PendingChangesBarProps) {
  if (overrideKeys.length === 0 && familyKeys.length === 0) return null;

  return (
    <div className="sticky bottom-0 z-10 border rounded-md bg-card shadow-md px-3 py-2 flex items-center gap-3">
      <div className="flex-1 min-w-0 text-xs space-y-0.5">
        {overrideKeys.length > 0 && (
          <p className="truncate">
            <span className="font-medium">{overrideKeys.length}</span> change
            {overrideKeys.length === 1 ? "" : "s"} → this model&apos;s override (
            <span className="font-mono text-[10px]">{overrideKeys.join(", ")}</span>)
          </p>
        )}
        {familyKeys.length > 0 && (
          <p className="truncate text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>
              <span className="font-medium">{familyKeys.length}</span> change
              {familyKeys.length === 1 ? "" : "s"} → family rules
              {apiName ? ` (${apiName})` : ""} — affects {familyModelCount} model
              {familyModelCount === 1 ? "" : "s"} (
              <span className="font-mono text-[10px]">{familyKeys.join(", ")}</span>)
            </span>
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1 shrink-0"
        onClick={onDiscardAll}
        disabled={saving}
      >
        <RotateCcw className="h-3 w-3" />
        Discard
      </Button>
      <Button
        size="sm"
        className="h-7 px-3 text-xs gap-1.5 shrink-0"
        onClick={onSave}
        disabled={saving}
      >
        <Save className="h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
