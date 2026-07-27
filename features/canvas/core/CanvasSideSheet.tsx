"use client";

/**
 * CanvasSideSheet — the ONLY importable name for the global canvas surface
 * (Method B front door; see the code-splitting skill).
 *
 * The heavy core (`./CanvasSideSheetImpl` — CanvasPane, renderers, artifact
 * materialization, content-IR) is dynamic({ssr:false}) behind a REAL
 * condition: it is not compiled into any server pass and its chunk is not
 * fetched until a canvas item actually exists. Before this front door,
 * `app/(public)/layout.tsx` imported the Impl statically — ~1.2 MB / 140+
 * modules riding on every anonymous marketing/legal/share page.
 *
 * This shell stays mounted everywhere the canvas is reachable and owns the
 * cheap, must-always-run concerns (everything it touches — canvasSlice,
 * redux hooks — is already in the shared store graph, so it adds ~zero):
 *  - `setCanvasAvailable(true/false)` on mount/unmount, so blocks that gate
 *    their "Open in canvas" affordance on availability show it.
 *  - The global ⌘\ / Ctrl+\ toggle shortcut (no-ops in the reducer when
 *    there is nothing to show). Bound here — not in the Impl — because the
 *    Impl isn't mounted until an item exists.
 *
 * Mount gate: `currentItemId != null`. `closeCanvas` keeps items and
 * `currentItemId` for reopen, so once opened the Impl stays mounted and the
 * Sheet's close animation plays normally; `clearCanvas` unmounts it again.
 */

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectCurrentItemId,
  setCanvasAvailable,
  toggleCanvas,
} from "@/features/canvas/redux/canvasSlice";

const CanvasSideSheetImpl = dynamic(
  () => import("./CanvasSideSheetImpl").then((m) => m.CanvasSideSheetImpl),
  { ssr: false, loading: () => null },
);

export function CanvasSideSheet() {
  const dispatch = useAppDispatch();
  const currentItemId = useAppSelector(selectCurrentItemId);

  // The canvas surface is reachable on this route → mark it available so
  // blocks which gate their "Open in canvas" affordance on availability
  // (e.g. MermaidBlock) actually show it. Without this, only the legacy
  // AdaptiveLayout ever set availability, so the modern chat hid the button.
  useEffect(() => {
    dispatch(setCanvasAvailable(true));
    return () => {
      dispatch(setCanvasAvailable(false));
    };
  }, [dispatch]);

  // Global keyboard shortcut: ⌘\ / Ctrl+\ toggles the canvas if there's
  // anything to show (the reducer no-ops when no item exists). Ignored when
  // focus is in a text field, so users mid-typing don't get yanked into /
  // out of the canvas accidentally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "\\") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const t = e.target as HTMLElement | null;
      const typing =
        t?.tagName === "INPUT" ||
        t?.tagName === "TEXTAREA" ||
        t?.isContentEditable;
      if (typing) return;
      e.preventDefault();
      dispatch(toggleCanvas());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  if (!currentItemId) return null;
  return <CanvasSideSheetImpl />;
}
