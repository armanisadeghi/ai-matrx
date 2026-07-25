/**
 * Surface manifest — Canvas Viewer (`matrx-user/canvas-viewer`).
 *
 * The floating Canvas Viewer window (overlay `canvasViewerWindow`,
 * `CanvasViewerWindow`): the user pastes a shared-canvas link or token into
 * the footer resolver bar and views the resolved canvas
 * (`SharedCanvasView`) in the body. Distinct from the `/canvas` route
 * surface (`matrx-user/canvas`) — this window is read-only viewing of a
 * SHARED canvas by token.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "share_token",
    label: "Share token",
    description:
      "Resolved share token of the canvas currently displayed. Empty when no canvas has been resolved yet (the empty state).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 300,
  },
  {
    name: "token_input",
    label: "Resolver input",
    description:
      "Raw text in the footer resolver bar (a pasted link or token) before resolution. Empty when untouched.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    autoContext: false,
    sortOrder: 310,
  },
];

export const canvasViewerManifest: SurfaceManifest = {
  surfaceName: "matrx-user/canvas-viewer",
  readiness: "stub",
  readinessNote:
    "Values authored from a code audit of CanvasViewerWindow; no runtime emitter yet — nothing emits this scope.",
  overlayId: "canvasViewerWindow",
  label: "Canvas Viewer",
  intro: `<surface_intro>
You are on the Canvas Viewer — a floating window for viewing a SHARED canvas by token or link. share_token identifies the canvas being displayed; when it is empty the user has not resolved one yet. The canvas content itself is rendered read-only from the share token.
</surface_intro>`,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

export function createCanvasViewerScope(values: {
  share_token?: string;
  token_input?: string;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
