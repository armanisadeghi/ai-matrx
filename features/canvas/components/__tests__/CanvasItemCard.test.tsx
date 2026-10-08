/**
 * An `edit_artifact` result shows the NEW version's card (rendered-output
 * standard, ruling 1). The chat package hands the host slot the version row the
 * tool wrote (`an-artifact-edit-shows-its-new-version.test.ts` in the package);
 * this proves the host slot renders THAT row — its id, its html — through the
 * artifact renderer, never the message's older version.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getById = jest.fn();
jest.mock("@/features/canvas/services/canvasArtifactService", () => ({
  canvasArtifactService: { getById: (id: string) => getById(id) },
}));
jest.mock("@/features/canvas/artifact-types/artifact-renderers", () => ({
  ArtifactRender: (props: { canvasType: string; artifactId: string; data: unknown }) => (
    <div data-rendered-type={props.canvasType} data-rendered-id={props.artifactId}>
      {String(props.data)}
    </div>
  ),
}));
jest.mock("@ai-matrx/design-system/controls", () => ({
  RegionSkeleton: () => <div data-skeleton="" />,
}));

import { CanvasItemCard } from "../CanvasItemCard";

const V2 = "fd364e70-60a5-4ea6-95bb-90f7147c25b1";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  getById.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("renders the version the tool wrote, by its own id and content", async () => {
  getById.mockResolvedValue({
    id: V2,
    type: "html",
    content: { data: "<!DOCTYPE html><title>Learn Binary (edited by edit_artifact)</title>", metadata: {} },
    conversation_id: null,
    source_message_id: null,
  });
  await act(async () => {
    root.render(<CanvasItemCard canvasItemId={V2} version={2} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(getById).toHaveBeenCalledWith(V2);
  const card = host.querySelector("[data-rendered-id]");
  expect(card?.getAttribute("data-rendered-id")).toBe(V2);
  expect(card?.getAttribute("data-rendered-type")).toBe("html");
  expect(card?.textContent).toContain("edited by edit_artifact");
});

it("says so when the version is gone", async () => {
  getById.mockResolvedValue(null);
  await act(async () => {
    root.render(<CanvasItemCard canvasItemId={V2} version={2} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(host.textContent).toContain("This version was removed.");
});
