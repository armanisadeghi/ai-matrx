"use client";

import React, { useState, useCallback, useRef } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
// The real Notes window is opened through the sanctioned openers layer, never
// imported here: a direct import of the component would pull it (and its whole
// window-panels chunk graph) into this route's bundle, which is exactly what
// the `features/window-panels/windows/**` import ban exists to prevent.
// OverlayController owns the only import of the component itself.
import {
  useOpenNotesWindow,
  type NotesWindowHandle,
} from "@/features/overlays/openers/notesWindow";
import { Plus, Trash2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsOverlayOpen } from "@/lib/redux/slices/overlaySlice";
import { DEMO_WINDOWS } from "./demo-windows";

const NOTES_INSTANCE_ID = "window-demo-notes";

export default function WindowDemoPage() {
  const [openWindows, setOpenWindows] = useState<Set<string>>(
    () => new Set(["window-0", "window-1"]),
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

  // The overlay store is the ONE truth for whether the Notes window is up, so
  // closing it from its own title bar keeps this toggle honest.
  const openNotesWindow = useOpenNotesWindow();
  const notesHandleRef = useRef<NotesWindowHandle | null>(null);
  const notesOpen = useAppSelector((state) =>
    selectIsOverlayOpen(state, "notesWindow", NOTES_INSTANCE_ID),
  );
  const toggleNotes = useCallback(() => {
    if (notesOpen) {
      notesHandleRef.current?.close();
      notesHandleRef.current = null;
      return;
    }
    notesHandleRef.current = openNotesWindow({
      instanceId: NOTES_INSTANCE_ID,
      title: "Notes",
    });
  }, [notesOpen, openNotesWindow]);

  return (
    <div className="h-full flex flex-col bg-textured overflow-hidden">
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
            onClick={toggleNotes}
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

      {/* The real Notes window renders from OverlayController, opened above. */}

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
