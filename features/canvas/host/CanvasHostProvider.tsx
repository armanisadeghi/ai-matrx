"use client";

/**
 * The app's ONE binding to @ai-matrx/canvas: canvas state lives in the Redux
 * store under `canvasHost`, every artifact content type and every tool (Quick
 * Chat, Quick Notes, a conversation's Documents…) is registered as a kind, and
 * refused opens are announced through the canvas open-drop reporter.
 */

import { useEffect, useState, type ReactNode } from "react";
import { useStore } from "react-redux";
import { bindCanvasToReduxStore, type CanvasErrorReport } from "@ai-matrx/canvas";
import { CanvasProvider } from "@ai-matrx/canvas/react";
import type { RootState } from "@/lib/redux/rootReducer";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";
import { registerArtifactCanvasKinds } from "./artifactKinds";
import { registerFeatureCanvasKinds } from "./featureCanvasKinds";
import { registerToolCanvasKinds } from "./toolKinds";
import { CANVAS_OUTPUT_PORTS } from "@/features/canvas/output/canvasOutputPorts";
// Every artifact type's print adapter joins the one block-printer registry (chat block, canvas tab
// and message Print share it); the page capture port wires Full Print's frame pre-pass.
import "@/features/canvas/artifact-types/artifact-printers";
import "@/features/canvas/output/capturePort";

// Kinds register at module load so a persisted layout renders its tabs on the
// first paint after hydration, not one tick later.
registerArtifactCanvasKinds();
registerFeatureCanvasKinds();
registerToolCanvasKinds();

function onCanvasError(report: CanvasErrorReport) {
  if (report.code === "non-json-data" || report.code === "unknown-kind") {
    reportCanvasOpenDrop({
      reason: report.code === "unknown-kind" ? "unknown-type" : "no-content",
      detail: report.message,
    });
    return;
  }
  console.error(`[canvas] ${report.code}: ${report.message}`, report.detail ?? "");
}

/**
 * THE CANVAS SHRINKS FIRST — measured against the MAIN column, not the window.
 *
 * The package keeps `centreMinWidth` for "the content beside the canvas", and by
 * default that content is the whole window. In the shell it is not: the sidebar
 * and the docked chat sit left of the page, so a 1440px window with the chat
 * open and a 900px canvas left the page 56px and every route header scrolled
 * under its clip. The region the canvas shares is everything right of the
 * page's left edge (`.shell-main`), so the page itself keeps the minimum. Null
 * (the window) where there is no shell — the public and link layouts.
 */
function useShellRegionWidth(): number | null {
  const [region, setRegion] = useState<number | null>(null);
  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".shell-main");
    if (!main) return;
    const measure = () => {
      const next = Math.round(window.innerWidth - main.getBoundingClientRect().left);
      setRegion((prev) => (prev === next ? prev : next));
    };
    measure();
    // The page's left edge moves when the sidebar or the chat changes width,
    // and each of those resizes the page; the canvas moving only its right
    // edge leaves the region unchanged, so this never feeds back.
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return region;
}

export function CanvasHostProvider({ children }: { children: ReactNode }) {
  const store = useStore<RootState>();
  const [binding] = useState(() => bindCanvasToReduxStore(store, (root) => root.canvasHost));
  const regionWidth = useShellRegionWidth();
  return (
    <CanvasProvider store={binding} onError={onCanvasError} regionWidth={regionWidth} output={CANVAS_OUTPUT_PORTS}>
      {children}
    </CanvasProvider>
  );
}
