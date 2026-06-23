"use client";

// CanvasViewerWindow — view a shared canvas by token / link inside a floating
// WindowPanel.
//
// Thin COMPOSITION ROOT (mirrors NotesWindow / FeedbackWindow): the token
// resolver bar is CHROME, not content. It lives in the WindowPanel `footer`
// slot — a full-width horizontal bar (input + Resolve) that matches the
// resolver's shape and never crowds the centered header title. The body holds
// ONLY the canvas (or the empty-state). The resolver state is owned here at the
// root so it can feed BOTH the footer slot and the body.

import React, { useState, useEffect } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { SharedCanvasView } from "@/features/canvas/shared/SharedCanvasView";
import { Search } from "lucide-react";

export interface CanvasViewerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  instanceId?: string;
  initialShareToken?: string;
}

export function CanvasViewerWindow({
  isOpen,
  onClose,
  title = "Canvas Viewer",
  instanceId = "default",
  initialShareToken,
}: CanvasViewerWindowProps) {
  const [tokenInput, setTokenInput] = useState("");
  const [activeToken, setActiveToken] = useState<string | undefined>(undefined);

  // Sync initial token on open
  useEffect(() => {
    if (isOpen && initialShareToken) {
      setActiveToken(initialShareToken);
      setTokenInput(initialShareToken);
    }
  }, [isOpen, initialShareToken]);

  const resolveToken = (input: string) => {
    if (!input) return null;
    const val = input.trim();
    try {
      const url = new URL(val);
      const match = url.pathname.match(/\/canvas\/shared\/([^/?#]+)/);
      if (match) return match[1];
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1];
    } catch {
      const match = val.match(/(?:\/)?canvas\/shared\/([^/?#]+)/);
      if (match) return match[1];
      const parts = val.split("/").filter(Boolean);
      return parts[parts.length - 1];
    }
    return val;
  };

  const handleResolve = () => {
    const resolved = resolveToken(tokenInput);
    if (resolved) {
      setActiveToken(resolved);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleResolve();
    }
  };

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={`canvas-viewer-${instanceId}`}
      title={title}
      onClose={onClose}
      minWidth={350}
      minHeight={250}
      width={700}
      height={550}
      overlayId="canvasViewerWindow"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onCollectData={() => ({ shareToken: activeToken ?? null })}
      footer={
        <CanvasResolverBar
          tokenInput={tokenInput}
          onTokenInputChange={setTokenInput}
          onResolve={handleResolve}
          onKeyDown={handleKeyDown}
        />
      }
    >
      <div className="flex-1 min-h-0 relative bg-background">
        {activeToken ? (
          <SharedCanvasView shareToken={activeToken} className="h-full min-h-0" />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-full border border-border bg-muted flex items-center justify-center mb-3">
              <Search className="w-5 h-5 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-medium text-foreground">
              No Canvas Selected
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-[250px]">
              Enter a generated canvas code or shared link below to view it in
              this window.
            </p>
          </div>
        )}
      </div>
    </WindowPanel>
  );
}

// ─── Footer slot: the token resolver bar ──────────────────────────────────────
// Chrome, not content. The resolver state is owned by the window root and fed
// in via props so this bar stays a pure presentation unit.

function CanvasResolverBar({
  tokenInput,
  onTokenInputChange,
  onResolve,
  onKeyDown,
}: {
  tokenInput: string;
  onTokenInputChange: (value: string) => void;
  onResolve: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <input
        type="text"
        className="flex-1 h-7 text-xs px-2 rounded-md border border-border bg-background focus:ring-1 focus:ring-primary outline-none placeholder:text-muted-foreground/50 transition-all font-mono"
        placeholder="Paste canvas link or token (e.g. y33f8x...)"
        value={tokenInput}
        onChange={(e) => onTokenInputChange(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button
        onClick={onResolve}
        className="h-7 px-3 flex items-center gap-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
      >
        <Search className="w-3.5 h-3.5" />
        Resolve
      </button>
    </div>
  );
}
