/** @jest-environment jsdom */
//
// A KIND IS NEVER DRAWN AS RAW JSON — the workflow-emission leg (W1/W2 of
// features/content-ir/docs/KIND_NEVER_RAW_CHECKLIST.md, Arman 2026-09-30).
//
// `EmissionRender` is the ONE door an emission passes through: a
// kind-carrying emission renders as its kind component, a kindless one
// through `DbEmitRenderer`. A surface that mounts `DbEmitRenderer` itself
// skips the kind route and paints a kind through the generic body.
//
// RED BEFORE GREEN: before the fix RunEmissions and seven bake-off run pages
// imported `DbEmitRenderer` directly, so the census failed (8 offenders) and
// the RunEmissions render drew the kind payload through the emit renderer.

import React, { act } from "react";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { createRoot, type Root } from "react-dom/client";

import type { WorkflowRunEmission } from "../../redux/workflow-runs.slice";
import { featureRegExp } from "@/scripts/lib/source-roots.cjs";

let emissions: WorkflowRunEmission[] = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => emissions,
}));
// The chat package reads these hooks through its own module (P3): one double covers both.
jest.mock("@ai-matrx/chat/store/hooks", () => jest.requireMock("@/lib/redux/hooks"));
jest.mock("../../redux/workflow-runs.selectors", () => ({
  selectRunEmissions: () => () => emissions,
}));
jest.mock(
  "@/features/content-ir/studio/components/KindInstanceRender",
  () => ({
    __esModule: true,
    default: ({ kind }: { kind: string }) => (
      <div data-route="kind">Kind component: {kind}</div>
    ),
  }),
);
jest.mock("@/features/workflow-emit/DbEmitRenderer", () => ({
  DbEmitRenderer: ({ payload }: { payload: unknown }) => (
    <pre data-route="emit">{JSON.stringify(payload)}</pre>
  ),
}));
jest.mock("@/components/official/structured-value/StructuredValueView", () => ({
  StructuredValueView: () => <div data-route="floor" />,
}));
jest.mock("@ai-matrx/chat/ui/markdown-stream/MarkdownStream", () => ({
  __esModule: true,
  default: () => <div data-route="markdown" />,
}));
jest.mock("@ai-matrx/media/react", () => ({ InlineMediaRef: () => null }));
jest.mock("../../components/WorkflowDocumentActions", () => ({
  WorkflowDocumentActions: () => null,
}));

import { RunEmissions } from "../../components/run/RunEmissions";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const RUNTIME_ROOT = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

function emission(
  overrides: Partial<WorkflowRunEmission>,
): WorkflowRunEmission {
  return {
    nodeId: "deliver",
    mode: "full",
    payload: null,
    componentRef: null,
    title: null,
    presentation: "panel",
    kind: null,
    kindOk: null,
    metadata: null,
    ts: "2026-09-30T20:00:00Z",
    seq: 1,
    persisted: true,
    ...overrides,
  };
}

const flashcardsPayload = {
  __kind: "flashcard_set",
  title: "Cell biology",
  cards: [{ front: "Mitochondria", back: "Makes ATP" }],
};

describe("workflow emissions go through the kind door", () => {
  it("no run surface mounts DbEmitRenderer except EmissionRender", () => {
    const offenders = sourceFiles(RUNTIME_ROOT)
      .filter((file) =>
        featureRegExp(/from\s+["']@\/features\/workflow-emit\/DbEmitRenderer["']/).test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => relative(RUNTIME_ROOT, file))
      .filter((file) => file !== join("kind-emissions", "EmissionRender.tsx"));
    expect(offenders).toEqual([]);
  });

  describe("RunEmissions", () => {
    let container: HTMLDivElement;
    let root: Root;
    beforeEach(() => {
      container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
    });
    afterEach(() => {
      act(() => root.unmount());
      container.remove();
    });

    it("draws a kind-carrying emission as its kind, never raw JSON", () => {
      emissions = [
        emission({
          kind: "flashcard_set",
          kindOk: true,
          payload: {
            __kind: "flashcard_set",
            title: "Cell biology",
            cards: [{ front: "Mitochondria", back: "Makes ATP" }],
          },
        }),
      ];
      act(() => root.render(<RunEmissions runId="run-1" />));
      expect(container.querySelector('[data-route="kind"]')).not.toBeNull();
      expect(container.textContent).toContain("flashcard_set");
      expect(container.innerHTML).not.toContain('"__kind"');
      expect(container.querySelector('[data-route="emit"]')).toBeNull();
    });

    it("routes on the payload's own __kind when the wire kind is empty", () => {
      emissions = [emission({ kind: null, kindOk: null, payload: flashcardsPayload })];
      act(() => root.render(<RunEmissions runId="run-1" />));
      expect(container.querySelector('[data-route="kind"]')?.textContent).toContain(
        "flashcard_set",
      );
      expect(container.querySelector('[data-route="emit"]')).toBeNull();
      expect(container.innerHTML).not.toContain('"__kind"');
    });

    it("sends a kindless payload carrying a nested kind to the canonical door", () => {
      emissions = [
        emission({ payload: { summary: "Week 3", pack: flashcardsPayload } }),
      ];
      act(() => root.render(<RunEmissions runId="run-1" />));
      expect(container.querySelector('[data-route="floor"]')).not.toBeNull();
      expect(container.querySelector('[data-route="emit"]')).toBeNull();
    });

    it("keeps an author's component for a kindless payload with a nested kind", () => {
      emissions = [
        emission({
          componentRef: "week_card",
          payload: { summary: "Week 3", pack: flashcardsPayload },
        }),
      ];
      act(() => root.render(<RunEmissions runId="run-1" />));
      expect(container.querySelector('[data-route="emit"]')).not.toBeNull();
    });

    it("keeps a kindless emission on the emit renderer", () => {
      emissions = [emission({ payload: { note: "Draft saved" } })];
      act(() => root.render(<RunEmissions runId="run-1" />));
      expect(container.querySelector('[data-route="emit"]')).not.toBeNull();
      expect(container.textContent).toContain("Draft saved");
    });
  });
});
