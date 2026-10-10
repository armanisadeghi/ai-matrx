"use client";

// features/files/components/surfaces/desktop/FileContextCell.tsx
//
// The per-row Context cell: amber shield = no context (the nudge), green =
// assigned; click opens the official assignment popover for that file. Scope
// ids come from the holder (`entityScopesByKey`), filled by FileTable with ONE bulk
// query per visible page — this cell never fetches on its own.

import React from "react";
import { FileText } from "lucide-react";
import { useRowScopes, useSetRowScopes } from "@/features/scopes/hooks/useRowScopes";
import { ContextStatusButton } from "@/features/scopes/components/context-assignment/ContextStatusButton";

export function FileContextCell({
  fileId,
  fileName,
}: {
  fileId: string;
  fileName: string;
}) {
  const entry = useRowScopes("file", fileId);
  const setRowScopes = useSetRowScopes();

  // A refused read says so (never an amber "no context" it does not know).
  if (entry.status === "error") {
    return (
      <span className="text-xs text-destructive" title={entry.error ?? undefined}>
        Not loaded
      </span>
    );
  }
  if (entry.status !== "ready") {
    return <span className="text-xs text-muted-foreground/50">…</span>;
  }
  const scopeIds = entry.scope_ids;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <ContextStatusButton
        showScopeLabel
        subject={{
          entityType: "file",
          entityId: fileId,
          title: fileName,
          icon: FileText,
        }}
        knownScopeCount={scopeIds.length}
        writeMode="live"
        onSaved={(r) => {
          if (r.ok)
            setRowScopes(
              "file",
              fileId,
              r.selection.scopeIds.filter((id) => !id.startsWith("new:")),
            );
        }}
      />
    </div>
  );
}
