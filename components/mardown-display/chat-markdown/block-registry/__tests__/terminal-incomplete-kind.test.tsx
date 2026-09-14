/**
 * Reload parity for a provider-stopped Shape response.
 *
 * The fixture is minimized from chat 6340dae7-6a04-497c-b4fb-2f2d294c7778:
 * Gemini stopped for recitation after twelve complete transcript segments and
 * inside segment 13's text string. The live accumulator retained a resolved,
 * status:error envelope; a reload previously lost that envelope and rendered
 * the fenced bytes as ordinary JSON.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => false,
}));

jest.mock(
  "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors",
  () => ({
    selectHideReasoning: () => false,
    selectHideToolResults: () => false,
  }),
);

jest.mock("@/features/content-ir/react/use-registry-repaint", () => ({
  useContentIrKindVersion: () => 0,
}));

jest.mock("@/features/content-ir/react/ensure-kind-renderable", () => ({
  useEnsureKindRenderable: () => {},
}));

jest.mock("@/features/content-ir/react/partial-kind-route", () => ({
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

jest.mock("../BlockComponentRegistry", () => ({
  BlockComponents: {
    BasicMarkdownContent: ({ content }: { content: string }) =>
      React.createElement("div", { "data-basic-markdown": true }, content),
  },
  LoadingComponents: {},
}));

jest.mock("@/features/content-ir/records/KindRecordChrome", () => ({
  kindHasRecordChrome: () => true,
  KindRecordChrome: () =>
    React.createElement("div", { "data-record-chrome": true }),
}));

jest.mock("../block-dispatch", () => ({
  isBlockLoading: () => false,
  reportUnregisteredBlockType: () => {},
  resolveBlockDispatch: () =>
    ({ block }: { block: { type: string; metadata?: Record<string, unknown> } }) => {
      const envelope = block.metadata?.__ir as
        | { root?: { kind?: string; status?: string } }
        | undefined;
      return React.createElement("div", {
        "data-routed-type": block.type,
        "data-root-kind": envelope?.root?.kind,
        "data-root-status": envelope?.root?.status,
      });
    },
}));

// 🚨 A PARTIAL MOCK OF A REAL MODULE IS A SUITE THAT DIES ON THE NEXT EXPORT
// (DD-239). This suite had already stopped running: the session barrier calls
// `setSessionStateProbe` from this module when the Supabase client is built, and
// the mock did not have it, so the file died at import with zero tests while
// still looking like a test file. Spread the real module.
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: () => {},
}));

import { BlockRenderer } from "../BlockRenderer";
import { componentRegistry } from "@/features/content-ir/registry/component-registry";
import type { KindComponentProjection } from "@/features/content-ir/registry/schema-source-kind-components";
import { memoizedRegionEnvelope } from "@/features/content-ir/registry/region-envelope-memo";

const TRUNCATED = `{
  "__kind": "video_transcript_research",
  "title": "AP Precalculus – 1.4 Polynomial Functions and Rates of Change",
  "overview": "A lesson about polynomial functions.",
  "keyPoints": ["Rates of change"],
  "segments": [
    {"__kind":"transcript_segment","id":"seg-0001","text":"Hey, welcome back to AP Precalc.","speaker":"Mr. Kelly","timecode":"00:00:07","seconds":7,"isHighlighted":false},
    {"__kind":"transcript_segment","id":"seg-0013","text":"This response ends`;

const registeredRow: KindComponentProjection = {
  kind: "video_transcript_research",
  platform: "web",
  role: "output",
  componentKey: "video_transcript_research_view",
  source: "db",
  isActive: true,
  config: {},
  componentSource: "export default function View() { return null; }",
  propsTransform: null,
  pinnedKindVersion: null,
  updatedAt: "2026-09-13T00:00:00Z",
  createdAt: "2026-09-13T00:00:00Z",
  createdBy: null,
  id: "00000000-0000-0000-0000-000000006340",
};

const noOp = () => {};

describe("terminal incomplete Shape reload", () => {
  beforeAll(() => {
    componentRegistry.ingestDbRows([registeredRow]);
  });

  it("re-enters the resolved root renderer, announces incompleteness, and offers no record save", () => {
    const html = renderToStaticMarkup(
      <BlockRenderer
        block={{ type: "code", content: TRUNCATED }}
        index={0}
        isStreamActive={false}
        replaceBlockContent={noOp}
        handleOpenEditor={noOp}
      />,
    );

    expect(html).toContain('data-routed-type="db_kind_component"');
    expect(html).toContain('data-root-kind="video_transcript_research"');
    expect(html).toContain('data-root-status="error"');
    expect(html).toContain(
      "This response is incomplete. The content received so far is shown below.",
    );
    expect(html).toContain('data-incomplete-kind="video_transcript_research"');
    expect(html).not.toContain("data-record-chrome");
  });

  it("does not terminal-normalize the same bytes while their block is still streaming", () => {
    const html = renderToStaticMarkup(
      <BlockRenderer
        block={{ type: "code", content: TRUNCATED, isStreamingBlock: true }}
        index={0}
        isStreamActive
        replaceBlockContent={noOp}
        handleOpenEditor={noOp}
      />,
    );

    expect(html).toContain('data-routed-type="code"');
    expect(html).not.toContain("data-root-kind");
    expect(html).not.toContain("This response is incomplete");
  });

  it("keeps the default memo path complete-only after terminal recovery cached the source", () => {
    expect(
      memoizedRegionEnvelope(TRUNCATED, { allowTerminalError: true })?.root,
    ).toMatchObject({
      kind: "video_transcript_research",
      kindState: "resolved",
      status: "error",
    });
    expect(memoizedRegionEnvelope(TRUNCATED)).toBeNull();
  });
});
