"use client";

/**
 * The app's ONE binding to @ai-matrx/canvas: canvas state lives in the Redux
 * store under `canvasHost`, every artifact content type and every tool (Quick
 * Chat, Quick Notes, a conversation's Documents…) is registered as a kind, and
 * refused opens are announced through the canvas open-drop reporter.
 */

import { useState, type ReactNode } from "react";
import { useStore } from "react-redux";
import { bindCanvasToReduxStore, type CanvasErrorReport } from "@ai-matrx/canvas";
import { CanvasProvider } from "@ai-matrx/canvas/react";
import type { RootState } from "@/lib/redux/rootReducer";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";
import { registerArtifactCanvasKinds } from "./artifactKinds";
import { registerFeatureCanvasKinds } from "./featureCanvasKinds";
import { registerToolCanvasKinds } from "./toolKinds";

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

export function CanvasHostProvider({ children }: { children: ReactNode }) {
  const store = useStore<RootState>();
  const [binding] = useState(() => bindCanvasToReduxStore(store, (root) => root.canvasHost));
  return (
    <CanvasProvider store={binding} onError={onCanvasError}>
      {children}
    </CanvasProvider>
  );
}
