"use client";

/**
 * SandboxInsightPanel — Creator Hub "Sandbox" tab.
 *
 * Live window into the sandbox bound to the focused conversation: filesystem,
 * status, env, logs (via SandboxDiagnosticsPanel) and a command terminal (via
 * SimpleTerminal). Resolves the bound box with the same logic the agent uses
 * (resolveAgentSandboxRef), so what you see here is exactly the box the agent's
 * tools act in.
 *
 * Access tiers are deliberately NOT enforced yet — that's a later pass. For now
 * the whole surface is shown to whoever opens the Creator Hub.
 */

import { useState } from "react";
import { Box, FolderTree, TerminalSquare, FileText } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { resolveAgentSandboxRef } from "@/lib/sandbox/active-binding";
import { SandboxDiagnosticsPanel } from "@/features/code/views/sandboxes/SandboxDiagnosticsPanel";
import { SimpleTerminal } from "@/features/code/terminal/SimpleTerminal";
import { SandboxFileViewer } from "./SandboxFileViewer";

type View = "files" | "terminal" | "viewer";

export function SandboxInsightPanel({
  conversationId,
}: {
  conversationId: string;
}) {
  // Select primitives (string|null) so the panel doesn't re-render on every
  // unrelated state change — resolveAgentSandboxRef returns a fresh object.
  const boundRowId = useAppSelector(
    (s) => resolveAgentSandboxRef(s, conversationId)?.rowId ?? null,
  );
  const source = useAppSelector(
    (s) => resolveAgentSandboxRef(s, conversationId)?.source ?? null,
  );
  const tier = useAppSelector(
    (s) => resolveAgentSandboxRef(s, conversationId)?.tier ?? null,
  );
  const [view, setView] = useState<View>("files");

  if (!boundRowId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Box className="h-6 w-6 text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">No sandbox bound</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          This conversation isn&apos;t bound to a sandbox. Attach one from the
          chat input controls (the box icon), then it&apos;ll appear here live.
        </p>
      </div>
    );
  }

  const sourceLabel =
    source === "conversation-override"
      ? "this conversation"
      : source === "user-active"
        ? "shared (all conversations)"
        : "editor";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header: which box + sub-view toggle */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Box className="h-4 w-4 shrink-0 text-emerald-500" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-foreground truncate">
              {boundRowId.slice(0, 8)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {tier ?? "?"} · bound from {sourceLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setView("files")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
              view === "files"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <FolderTree className="h-3.5 w-3.5" />
            Files &amp; status
          </button>
          <button
            onClick={() => setView("terminal")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
              view === "terminal"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <TerminalSquare className="h-3.5 w-3.5" />
            Terminal
          </button>
          <button
            onClick={() => setView("viewer")}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
              view === "viewer"
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            File
          </button>
        </div>
      </div>

      {/* Body — keep both mounted? No: terminal owns input focus, so swap. */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {view === "files" ? (
          <div className="h-full overflow-y-auto">
            <SandboxDiagnosticsPanel sandboxId={boundRowId} view="all" />
          </div>
        ) : view === "terminal" ? (
          <div className="h-full overflow-hidden">
            <SimpleTerminal sandboxId={boundRowId} />
          </div>
        ) : (
          <div className="h-full overflow-hidden">
            <SandboxFileViewer sandboxRowId={boundRowId} />
          </div>
        )}
      </div>
    </div>
  );
}
