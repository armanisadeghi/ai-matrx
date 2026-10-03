/**
 * A finished `<artifact type="timeline" title="X">` printed "X" twice in a row:
 * ArtifactBlock's muted title label, then the timeline card's own header title.
 * A kind whose card prints its own title gets no label; one that does not
 * (html) keeps it; a still-streaming one keeps it (no card header yet).
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/features/canvas/export/exportArtifactMarkdown", () => ({ artifactContentToMarkdown: () => "" }));
jest.mock("@/features/canvas/materialization/useUnbindArtifact", () => ({
  useUnbindArtifact: () => ({ canUnbind: false, busy: false, unbind: jest.fn(), surfaceNoun: "message" }),
}));
jest.mock("@/features/canvas/components/ArtifactVersionHistory", () => ({ ArtifactVersionHistory: () => null }));
jest.mock("@/features/canvas/hooks/useCanvas", () => ({ useCanvas: () => ({ open: jest.fn() }) }));
jest.mock("@/features/canvas/hooks/useOpenArtifactInCanvas", () => ({
  useOpenArtifactInCanvas: () => ({ openArtifact: jest.fn() }),
}));
jest.mock("@/features/canvas/hooks/useCanvasOpenGuard", () => ({ useCanvasOpenGuard: () => ({ isCanvasAvailable: false }) }));
jest.mock("@/features/canvas/host/useArtifactCanvas", () => ({
  useArtifactContentToggle: () => ({ isVisible: false, closeIfVisible: () => false }),
}));
jest.mock("@/features/canvas/artifact-types/artifact-renderers", () => ({
  hasArtifactRenderer: () => true,
  ArtifactRender: () => <div data-testid="card" />,
}));
jest.mock("@/components/loaders/MatrxMiniLoader", () => () => null);
jest.mock("@/features/code-editor/components/code-block/CodeBlock", () => () => null);
jest.mock("@/components/mardown-display/chat-markdown/BasicMarkdownContent", () => () => null);
jest.mock("@/components/mardown-display/chat-markdown/block-registry/json-parse-utils", () => ({
  safeJsonParse: (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  },
}));

import ArtifactBlock from "../ArtifactBlock";

function render(artifactType: string, isComplete = true, payloadTitle = "Roman Republic"): string {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <ArtifactBlock
        content={JSON.stringify({ __kind: "x", title: payloadTitle })}
        metadata={{ artifactType, artifactTitle: "Roman Republic", isComplete }}
      />,
    );
  });
  const text = host.textContent ?? "";
  act(() => root.unmount());
  host.remove();
  return text;
}

describe("an artifact's title shows once", () => {
  it.each(["timeline", "research", "quiz", "recipe", "comparison", "decision-tree", "diagram", "progress", "troubleshooting", "resources", "math_problem"])(
    "%s: no label above a card that prints its own title",
    (type) => {
      expect(render(type)).not.toContain("Roman Republic");
    },
  );

  it("a payload titled differently keeps the label (it is the only place the attribute title shows)", () => {
    expect(render("timeline", true, "Something else")).toContain("Roman Republic");
  });

  it("a kind whose card has no title keeps the label", () => {
    expect(render("html")).toContain("Roman Republic");
  });

  it("while streaming the label stays (no card header yet)", () => {
    expect(render("timeline", false)).toContain("Roman Republic");
  });
});
