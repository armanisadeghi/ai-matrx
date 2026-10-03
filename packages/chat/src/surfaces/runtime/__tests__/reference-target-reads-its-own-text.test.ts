/**
 * A WRITE TARGET WHOSE READ TWIN IS A REFERENCE READS ITS TEXT FROM ITS HANDLER.
 *
 * The canvas sends an open HTML page as a `resource_ref` (2026-10-03) — the
 * page holds no body to put in its scope. Before `readCurrent`, an anchored
 * edit on such a target had nothing to resolve against (`current` was the
 * reference object → refused), and the approval card showed no "before". The
 * seam now asks the handler for the live text.
 */
const mockGetManifest = jest.fn();

jest.mock("../../../host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("../../../host/diagnostics", () => ({
  ...jest.requireActual("../../../host/diagnostics"),
  captureError: jest.fn(),
}));
jest.mock("@host/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@host/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
jest.mock("../registry", () => ({
  getManifest: mockGetManifest,
}));
jest.mock("@host/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindInputContractBySlug: jest.fn(),
}));

import { applySurfaceWrite, type SurfaceWriteApprovalProposal } from "../surface-writeback";
import { registerSurfaceRuntime } from "../SurfaceRuntimeContext";
import { canvasManifest } from "@host/features/surfaces/manifests/canvas.manifest";

const PAGE = "<!doctype html><html><head><title>Lab</title></head><body><h1>Mix two liquids</h1></body></html>";

function mountCanvas(apply: jest.Mock, readCurrent: () => Promise<string | null>) {
  mockGetManifest.mockImplementation((name: string) =>
    name === canvasManifest.surfaceName ? canvasManifest : undefined,
  );
  return registerSurfaceRuntime(
    {
      surfaceName: canvasManifest.surfaceName,
      getScope: () => ({
        current_canvas_item: {
          __kind: "resource_ref",
          resource_type: "html_page",
          resource_id: "3b0f6a52-8e1c-4f7d-9a2b-1c2d3e4f5a6b",
          label: "Lab",
        },
        current_canvas_type: "iframe",
        current_canvas_is_saved: true,
        open_items: [],
        item_count: 1,
        is_split: false,
        render_mode: "global",
      }),
      getWriteHandlers: () => ({ canvas_item_content: { apply, readCurrent } }),
    },
    10,
  );
}

describe("canvas_item_content: an anchored edit resolves against the handler's live text", () => {
  beforeEach(() => jest.clearAllMocks());

  it("a str_replace lands one change and the card shows the real before", async () => {
    const apply = jest.fn();
    const unregister = mountCanvas(apply, async () => PAGE);
    let proposal: SurfaceWriteApprovalProposal | undefined;
    try {
      const result = await applySurfaceWrite(
        "canvas_item_content",
        { command: "str_replace", old_str: "Mix two liquids", new_str: "Mix three liquids" },
        {
          origin: "agent",
          requestApproval: async (p) => {
            proposal = p;
            return { kind: "approved" };
          },
        },
      );
      expect(result.ok).toBe(true);
      expect(apply).toHaveBeenCalledWith(PAGE.replace("Mix two liquids", "Mix three liquids"));
      expect(proposal?.currentValue).toBe(PAGE);
    } finally {
      unregister();
    }
  });

  it("an anchor that is not in the live text is refused and nothing is applied", async () => {
    const apply = jest.fn();
    const unregister = mountCanvas(apply, async () => PAGE);
    try {
      const result = await applySurfaceWrite(
        "canvas_item_content",
        { command: "str_replace", old_str: "Not on the page", new_str: "x" },
        { origin: "agent", requestApproval: async () => ({ kind: "approved" }) },
      );
      expect(result.ok).toBe(false);
      expect(apply).not.toHaveBeenCalled();
    } finally {
      unregister();
    }
  });
});
