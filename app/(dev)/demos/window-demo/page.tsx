"use client";

import React, { useState, useCallback } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NotesWindow } from "@/features/window-panels/windows/notes/NotesWindow";
import { Plus, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import { DEMO_WINDOWS } from "./demo-windows";

const NOTES_WINDOW_ID = "window-notes";

export default function WindowDemoPage() {
  const [openWindows, setOpenWindows] = useState<Set<string>>(
    () => new Set(["window-0", "window-1", NOTES_WINDOW_ID]),
  );

  const openWindow = useCallback((id: string) => {
    setOpenWindows((prev) => new Set([...prev, id]));
  }, []);

  const closeWindow = useCallback((id: string) => {
    setOpenWindows((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const notesOpen = openWindows.has(NOTES_WINDOW_ID);

  return (
    <div className="h-[calc(100dvh-var(--header-height,2.5rem))] flex flex-col bg-textured overflow-hidden">
      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border bg-card/60 backdrop-blur-sm">
        <span className="text-sm font-semibold text-foreground/80 mr-2">
          Window Panel Demo
        </span>
        <span className="text-xs text-muted-foreground mr-4">
          Open windows to test drag, resize, minimize, and maximize.
        </span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Notes (real window) */}
          <Button
            type="button"
            size="xs"
            variant={notesOpen ? "default" : "outline"}
            onClick={() =>
              notesOpen
                ? closeWindow(NOTES_WINDOW_ID)
                : openWindow(NOTES_WINDOW_ID)
            }
          >
            <span className="text-amber-500">
              <FileText className="h-4 w-4" />
            </span>
            Notes
            {notesOpen ? (
              <Trash2 className="h-3 w-3 ml-0.5 opacity-60" />
            ) : (
              <Plus className="h-3 w-3 ml-0.5 opacity-60" />
            )}
          </Button>

          {/* Demo windows */}
          {DEMO_WINDOWS.map((def, i) => {
            const id = `window-${i}`;
            const isOpen = openWindows.has(id);
            const Icon = def.Icon;
            return (
              <Button
                key={id}
                type="button"
                size="xs"
                variant={isOpen ? "default" : "outline"}
                onClick={() => (isOpen ? closeWindow(id) : openWindow(id))}
              >
                <span className={def.iconColor}>
                  <Icon className="h-4 w-4" />
                </span>
                {def.title}
                {isOpen ? (
                  <Trash2 className="h-3 w-3 ml-0.5 opacity-60" />
                ) : (
                  <Plus className="h-3 w-3 ml-0.5 opacity-60" />
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* ── Canvas hint ────────────────────────────────────────────────────── */}
      <div className="flex-1 relative">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-sm text-muted-foreground/30 select-none">
            Drag windows anywhere on this canvas
          </p>
        </div>
      </div>

      {/* ── Notes Window (real, self-contained) ────────────────────────────── */}
      {notesOpen && (
        <NotesWindow
          id={NOTES_WINDOW_ID}
          width={520}
          height={400}
          initialRect={{ x: 560, y: 60 }}
          onClose={() => closeWindow(NOTES_WINDOW_ID)}
        />
      )}

      {/* ── Demo Windows (placeholder bodies) ─────────────────────────────── */}
      {DEMO_WINDOWS.map((def, i) => {
        const id = `window-${i}`;
        if (!openWindows.has(id)) return null;
        const Body = def.Body;
        return (
          <WindowPanel
            key={id}
            id={id}
            title={def.title}
            initialRect={def.initialRect}
            onClose={() => closeWindow(id)}
            bodyClassName="bg-zinc-900/50"
          >
            <Body />
          </WindowPanel>
        );
      })}
    </div>
  );
}
