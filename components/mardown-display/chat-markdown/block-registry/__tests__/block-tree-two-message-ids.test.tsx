/**
 * TWO MEANINGS, TWO FIELDS (@ai-matrx/kit/ids).
 *
 * Every block BlockRenderer dispatches gets:
 *   - `messageId`        the TRANSCRIPT KEY, always present — UI keys, anchors,
 *                        canvas de-duplication (`mermaid:${messageId}`), local state;
 *   - `durableMessageId` the DATABASE id — undefined until the answer has a row.
 *
 * Breaks caught: the transcript key nulled for a client-temp answer (every
 * "Open in canvas" click on an incognito answer stacked a new canvas item —
 * the 2026-10-01 round-2 regression), and a client-temp id reaching the
 * database field.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => false,
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));

jest.mock(
  "@ai-matrx/chat/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({
    selectHideReasoning: () => false,
    selectHideToolResults: () => false,
  }),
);

jest.mock("@ai-matrx/rich-content/kinds/react/use-registry-repaint", () => ({
  useContentIrKindVersion: () => 0,
}));

jest.mock("@ai-matrx/rich-content/kinds/react/ensure-kind-renderable", () => ({
  useEnsureKindRenderable: () => {},
}));

jest.mock("@ai-matrx/rich-content/kinds/react/partial-kind-route", () => ({
  resolveAnnouncedKindLoading: () => null,
  resolveProvisionalKindRender: () => null,
  resolveSupersededKindRender: () => null,
}));

jest.mock("@/features/canvas/artifact-types/artifact-type-registry", () => ({
  resolveArtifactDef: () => null,
}));

jest.mock("@/features/canvas/artifact-types/artifact-renderers", () => ({
  ArtifactRender: () => null,
  hasArtifactRenderer: () => false,
}));

jest.mock("@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockComponentRegistry", () => ({
  BlockComponents: {},
  LoadingComponents: {},
  registerBlockComponents: () => undefined,
  registerLoadingComponents: () => undefined,
}));

jest.mock("@/features/content-ir/records/KindRecordChrome", () => ({
  kindHasRecordChrome: () => false,
  KindRecordChrome: () => null,
}));

// The dispatched block reports exactly the two ids it was handed.
// The app's domain dispatch reads the engine's tables (BLOCK_DISPATCH, its classification) when it loads.
jest.mock("@ai-matrx/rich-content/display/chat-markdown/block-registry/block-dispatch", () => ({
  ...jest.requireActual("@ai-matrx/rich-content/display/chat-markdown/block-registry/block-dispatch"),
  registerBlockDispatch: () => undefined,
  isBlockLoading: () => false,
  reportUnregisteredBlockType: () => {},
  resolveBlockDispatch:
    () =>
    ({
      messageId,
      durableMessageId,
    }: {
      messageId?: string;
      durableMessageId?: string;
    }) =>
      React.createElement("div", {
        "data-transcript-key": messageId ?? "none",
        "data-durable-id": durableMessageId ?? "none",
      }),
}));

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: () => {},
}));

import { BlockRenderer } from "@ai-matrx/rich-content/display/chat-markdown/block-registry/BlockRenderer";
import { mintClientTempId } from "@ai-matrx/kit/ids";

const noOp = () => {};

function renderWith(messageId: string): string {
  return renderToStaticMarkup(
    <BlockRenderer
      block={{
        type: "mermaid",
        content: "flowchart LR\n  Intake --> Insurance --> Booking",
      }}
      index={0}
      isStreamActive={false}
      conversationId="1d89469c-0998-4bb4-b90a-446672519815"
      messageId={messageId}
      replaceBlockContent={noOp}
      handleOpenEditor={noOp}
    />,
  );
}

describe("a block gets the transcript key and the durable id as two fields", () => {
  it.each([
    mintClientTempId("assistant", "req_e61282d2-70ce-45f9-bac3-ebbd3f78d7e1"),
    mintClientTempId("assistant", "req_4f0b9c1e-2d3a-4c5b-9e8f-7a6b5c4d3e2f", "iter2"),
  ])("a client-temp answer %s keeps its transcript key and has no durable id", (id) => {
    const html = renderWith(id);
    expect(html).toContain(`data-transcript-key="${id}"`);
    expect(html).toContain('data-durable-id="none"');
  });

  it.each([
    "263550e7-eb60-4e8e-97ee-e19297126ebe",
    "993b734d-bd03-45bb-9bdd-0458025c89fb",
  ])("a durable answer %s carries the same id in both fields", (id) => {
    const html = renderWith(id);
    expect(html).toContain(`data-transcript-key="${id}"`);
    expect(html).toContain(`data-durable-id="${id}"`);
  });
});
