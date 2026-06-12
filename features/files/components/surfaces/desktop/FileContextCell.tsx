"use client";

// features/files/components/surfaces/desktop/FileContextCell.tsx
//
// The per-row Context cell: amber shield = no context (the nudge), green =
// assigned; click opens the official assignment popover for that file. Scope
// ids come from the shared row-scope store, primed by FileTable with ONE bulk
// query per visible page — this cell never fetches on its own.

import React, { useSyncExternalStore } from "react";
import { FileText } from "lucide-react";
import {
  subscribeRowScopes,
  getRowScopes,
  setRowScopes,
} from "@/features/scopes/components/context-assignment/data";
import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";

export function FileContextCell({ fileId, fileName }: { fileId: string; fileName: string }) {
  const scopeIds = useSyncExternalStore(
    subscribeRowScopes,
    () => getRowScopes("file", fileId),
    () => undefined,
  );

  if (scopeIds === undefined) {
    return <span className="text-xs text-muted-foreground/50">…</span>;
  }

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <ContextStatusButton
        subject={{ entityType: "file", entityId: fileId, title: fileName, icon: FileText }}
        knownScopeCount={scopeIds.length}
        writeMode="live"
        onSaved={(r) => {
          if (r.ok) setRowScopes("file", fileId, r.selection.scopeIds.filter((id) => !id.startsWith("new:")));
        }}
      />
      <span className="text-xs text-muted-foreground">
        {scopeIds.length === 0 ? "None" : `${scopeIds.length} scope${scopeIds.length === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
