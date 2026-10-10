/**
 * A file's Edit action opens its editor IN THE CANVAS — one
 * `cloud-file-editor` tab per file, body = the existing CloudFileInlineEditor
 * — never the docked Sheet copy of the same editor (deleted 2026-10-02).
 *
 * Proven failing before passing: with the kind left out of
 * FEATURE_CANVAS_KINDS the body case is RED; against the pre-canvas
 * FilePreview (requestEdit → CloudFileEditorHost) the source case is RED.
 */

import React, { act, useEffect } from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { configureStore } from "@reduxjs/toolkit";
import { CanvasColumn, useCanvas } from "@ai-matrx/canvas/react";
import type { CanvasController } from "@ai-matrx/canvas";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { CanvasHostProvider } from "@/features/canvas/host/CanvasHostProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CLOUD_FILE_EDITOR_KIND, openCloudFileEditor } from "@/features/files/canvas/cloudFileEditorKind";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

jest.mock("next/navigation", () => ({
  usePathname: () => "/files",
  useRouter: () => ({ push: () => undefined }),
}));
jest.mock("@/features/files/components/core/FileEditor/CloudFileInlineEditor", () => ({
  CloudFileInlineEditor: ({ fileId }: { fileId: string }) => <p data-editor-body="">{fileId}</p>,
}));

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await act(async () => {});
};

it("Edit opens the file's editor tab with the inline editor; again focuses the same tab", async () => {
  const store = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
  const seen: { canvas: CanvasController | null } = { canvas: null };
  function Grab() {
    const canvas = useCanvas();
    useEffect(() => canvas.registerPresentation(), [canvas]);
    seen.canvas = canvas;
    return null;
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <Provider store={store}>
          <TooltipProvider>
            <CanvasHostProvider>
              <CanvasColumn />
              <Grab />
            </CanvasHostProvider>
          </TooltipProvider>
        </Provider>
      </QueryClientProvider>,
    );
  });
  act(() => void openCloudFileEditor(seen.canvas, "f-1", "notes.md"));
  await flush();
  const ids = () => Object.keys(store.getState().canvasHost.items).filter((id) => id.startsWith(CLOUD_FILE_EDITOR_KIND));
  expect(ids()).toEqual([`${CLOUD_FILE_EDITOR_KIND}::f-1`]);
  expect(store.getState().canvasHost.items[`${CLOUD_FILE_EDITOR_KIND}::f-1`]?.title).toBe("notes.md");
  expect(document.querySelector("[data-editor-body]")?.textContent).toBe("f-1");

  act(() => void openCloudFileEditor(seen.canvas, "f-1", "notes.md"));
  expect(ids()).toHaveLength(1);
  act(() => root.unmount());
  container.remove();
});

it("the preview's Edit opens the canvas tab; the Sheet editor and its host are gone", () => {
  const files = join(__dirname, "..");
  // The action builder (usePreviewActions) owns the Edit hand-off; FilePreview only renders it.
  const preview = readFileSync(join(files, "components/core/FilePreview/usePreviewActions.ts"), "utf8");
  expect(preview).toContain("openCloudFileEditor(canvas, fileId");
  expect(preview).not.toContain("requestEdit(");
  // Monaco draws on a <canvas>: the kind must not claim a plain-DOM surface
  // (the canvas package logs an error for a "dom" kind whose body has a <canvas>).
  const kind = readFileSync(join(files, "canvas/cloudFileEditorKind.ts"), "utf8");
  expect(kind).toContain('surface: "frame"');
  expect(kind).toContain("print: printFileText");
  expect(kind).toContain("capture: captureVisibleEditor");
  expect(existsSync(join(files, "components/core/FileEditor/CloudFileEditor.tsx"))).toBe(false);
  expect(existsSync(join(files, "components/core/FileEditor/CloudFileEditorHost.tsx"))).toBe(false);
});
