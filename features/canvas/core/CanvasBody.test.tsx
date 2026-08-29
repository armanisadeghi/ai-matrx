import { act } from "react";
import { createRoot } from "react-dom/client";
import { ArtifactRender } from "@/features/canvas/artifact-types/artifact-renderers";
import { useCanvasItem } from "@/features/canvas/hooks/useCanvasItem";
import type { CanvasArtifactRow } from "@/features/canvas/services/canvasArtifactService";
import { CanvasBody } from "./CanvasBody";

jest.mock("@/features/canvas/artifact-types/artifact-renderers", () => ({
  hasArtifactRenderer: jest.fn(() => true),
  ArtifactRender: jest.fn(({ data }: { data: unknown }) => (
    <div data-testid="artifact-source">
      {typeof data === "string" ? data : "not-source-text"}
    </div>
  )),
}));

jest.mock("@/features/canvas/artifact-types/artifact-type-registry", () => ({
  getArtifactDef: jest.fn((type: string) =>
    type === "mermaid"
      ? { canvasType: "mermaid", userEditable: true }
      : undefined,
  ),
}));

jest.mock("@/features/canvas/hooks/useCanvasItem", () => ({
  useCanvasItem: jest.fn(),
}));

jest.mock("@ai-matrx/tap-target", () => ({
  TapTargetButton: ({
    label,
    onClick,
  }: {
    label?: string;
    onClick?: () => void;
  }) => <button onClick={onClick}>{label}</button>,
}));

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const ARTIFACT_ID = "e32ea214-8d07-4940-aa26-c68c72c55fd9";
const MERMAID_SOURCE = "flowchart TD\n  A --> B";

const row: CanvasArtifactRow = {
  id: ARTIFACT_ID,
  user_id: "00000000-0000-4000-8000-000000000001",
  type: "mermaid",
  title: "Flowchart",
  content: {
    data: MERMAID_SOURCE,
    type: "mermaid",
    metadata: { mermaid: { layout: "elk" } },
  },
  conversation_id: null,
  source_message_id: null,
  artifact_index: 1,
  version: 1,
  parent_canvas_id: null,
  source_type: "model_converted",
  external_system: null,
  external_id: null,
  created_at: "2026-08-27T00:00:00.000Z",
  updated_at: "2026-08-27T00:00:00.000Z",
};

async function renderCanvas() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <CanvasBody
        content={{
          type: "mermaid",
          data: { artifactId: ARTIFACT_ID },
          metadata: {
            canvasItemId: ARTIFACT_ID,
            title: "Flowchart",
          },
        }}
      />,
    );
  });

  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

describe("CanvasBody persisted artifacts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("hydrates a persisted Mermaid pointer before invoking the renderer", async () => {
    jest.mocked(useCanvasItem).mockReturnValue({
      row,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const view = await renderCanvas();

    expect(useCanvasItem).toHaveBeenCalledWith(ARTIFACT_ID, {
      resolve: "latest",
    });
    expect(view.container.textContent).toContain(MERMAID_SOURCE);
    expect(ArtifactRender).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: ARTIFACT_ID,
        canvasType: "mermaid",
        data: MERMAID_SOURCE,
        mode: "canvas",
      }),
      undefined,
    );

    await view.unmount();
  });

  it("shows a retryable failure instead of a blank Canvas", async () => {
    const refetch = jest.fn();
    jest.mocked(useCanvasItem).mockReturnValue({
      row: null,
      loading: false,
      error: "missing artifact",
      refetch,
    });

    const view = await renderCanvas();
    expect(view.container.textContent).toContain(
      "Couldn't load the saved artifact",
    );

    const retry = view.container.querySelector("button");
    await act(async () => retry?.click());
    expect(refetch).toHaveBeenCalledTimes(1);

    await view.unmount();
  });

  it("keeps an unmaterialized snapshot on the inline data path", async () => {
    jest.mocked(useCanvasItem).mockReturnValue({
      row: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CanvasBody
          content={{
            type: "mermaid",
            data: MERMAID_SOURCE,
            metadata: { canvasItemId: "artifact-1" },
          }}
        />,
      );
    });

    expect(useCanvasItem).not.toHaveBeenCalled();
    expect(container.textContent).toContain(MERMAID_SOURCE);

    await act(async () => root.unmount());
    container.remove();
  });
});
