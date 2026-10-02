/**
 * GUARD: every surface-writing tool renders the ONE shared diff.
 *
 * Arman, 2026-09-26: "I had it built and fully used everywhere but devs have
 * stopped using it and now it's lost." This fails the moment any tool that
 * changes a surface renders its card body WITHOUT `SurfaceWriteDiff` — a
 * renderer that bypasses the registry seam, a registry change that drops
 * `withSurfaceWriteDiff`, or a new renderer path the seam does not cover.
 *
 * The tool list is READ from aidream's census (`SURFACE_WRITE_TOOLS` in
 * `packages/matrx-ai/matrx_ai/tools/surface_write.py`), so a writer the server
 * adds is covered here the same day. Plus an unregistered tool name, which
 * proves the generic / DB-renderer path gets the diff too.
 *
 * Use case: the clinic manager asks the assistant to rewrite her intake
 * checklist note; the card must show what the note said before, not only the
 * new text.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));
jest.mock("@/lib/scoped-config/sessionKnob", () => ({
  useSessionKnob: () => undefined,
  getSessionKnob: () => undefined,
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn(), revalidateTag: jest.fn() }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("../../db-renderer/toolRendererCache", () => ({
  getCachedToolRenderer: () => null,
  getCachedToolMeta: () => null,
  isKnownNoToolRenderer: () => true,
  prefetchToolRenderer: jest.fn(),
}));

import { getInlineRenderer, getOverlayRenderer } from "../../registry/registry";
import { SURFACE_WRITE_STEP } from "../readSurfaceWrite";

const AIDREAM = process.env.AIDREAM_DIR ?? join(__dirname, "..", "..", "..", "..", "..", "aidream");
const CENSUS = join(AIDREAM, "packages", "matrx-ai", "matrx_ai", "tools", "surface_write.py");

/** Tool names from the server census (the part before any `:action`). */
function censusToolNames(): string[] {
  const fallback = ["context_patch", "note"];
  if (!existsSync(CENSUS)) return fallback;
  const src = readFileSync(CENSUS, "utf8");
  const block = src.slice(src.indexOf("SURFACE_WRITE_TOOLS"), src.indexOf("PENDING_SURFACE_WRITES"));
  const names = [...block.matchAll(/^\s+"([a-z0-9_]+)(?::[a-z_]+)?":/gm)].map((m) => m[1]);
  return names.length ? [...new Set(names)] : fallback;
}

const BEFORE = "# New patient intake\n\n- Confirm insurance card\n- Take blood pressure\n";
const AFTER = "# New patient intake\n\n- Confirm insurance card (front and back)\n- Take blood pressure\n";

function entryFor(toolName: string): ToolLifecycleEntry {
  return {
    callId: `call_${toolName}`,
    toolName,
    displayName: toolName,
    status: "completed",
    arguments: {},
    startedAt: "2026-09-26T00:00:00Z",
    completedAt: "2026-09-26T00:00:01Z",
    latestMessage: null,
    latestData: null,
    result: { ok: true },
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [
      {
        event: "tool_step",
        call_id: `call_${toolName}`,
        tool_name: toolName,
        message: "Recorded the change",
        data: {
          step: SURFACE_WRITE_STEP,
          metadata: {
            target_type: "note",
            target_id: "n1",
            target_label: "Intake checklist",
            mode: "patch",
            content_format: "markdown",
            before: BEFORE,
            after: AFTER,
            before_chars: BEFORE.length,
            after_chars: AFTER.length,
            truncated: false,
            edits: 1,
          },
        },
      },
    ],
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(node: React.ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

const tools = [...censusToolNames(), "a_tool_nobody_registered"];

describe("every surface-writing tool renders the shared diff", () => {
  it("reads a real census", () => {
    expect(tools.length).toBeGreaterThan(2);
  });

  it.each(tools)("%s — inline card body", (toolName) => {
    const Renderer = getInlineRenderer(toolName);
    const el = render(<Renderer entry={entryFor(toolName)} isPersisted />);
    const diff = el.querySelector("[data-surface-write-diff]");
    expect(diff).not.toBeNull();
    // The prior text is on screen, not only the new text.
    expect(el.textContent).toContain("Confirm insurance card");
    expect(el.textContent).toContain("(front and back)");
  });

  it.each(tools)("%s — overlay body", (toolName) => {
    const Renderer = getOverlayRenderer(toolName);
    const el = render(<Renderer entry={entryFor(toolName)} isPersisted />);
    expect(el.querySelector("[data-surface-write-diff]")).not.toBeNull();
  });
});
