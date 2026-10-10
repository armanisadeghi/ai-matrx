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

jest.mock("@ai-matrx/chat/host/notify", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
jest.mock("@ai-matrx/chat/host/diagnostics", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/diagnostics"),
  captureError: jest.fn(),
}));
jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));
jest.mock("@ai-matrx/chat/surfaces/runtime/registry", () => ({
  getManifest: mockGetManifest,
  peekSurfaceBody: (n: string) => (mockGetManifest)(n),
  peekSurfaceValue: (n: string, v: string) => (mockGetManifest)(n)?.values?.find((x: { name: string }) => x.name === v),
  loadSurfaceBody: async (n: string) => (mockGetManifest)(n),
  awaitSurfaceBodies: async () => ({ missing: [], waitedMs: 0 }),
  awaitSendSurfaceBodies: async () => [],
  takeSurfaceWithheldWarning: () => null,
  prefetchSurfaceBodies: () => {},
  isIndexedSurfaceClientToolName: () => false,
  useSurfaceBody: (n: string) => ({ status: "ready", body: (mockGetManifest)(n) }),
  getDeclaringSurface: () => null,
  getSurfaceAncestry: () => [],
  getSurfaceChildren: () => [],
}));
jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindInputContractBySlug: jest.fn(),
}));

import { applySurfaceWrite, type SurfaceWriteApprovalProposal } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import { registerSurfaceRuntime } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { canvasManifest } from "@/features/surfaces/manifests/canvas.manifest";

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

  it("a JSON-ENCODED patch (as models often send it) is still a patch", async () => {
    // Live 2026-10-03: value was the string '{"command": "str_replace", …}' and the
    // seam treated it as the new page text.
    const apply = jest.fn();
    const unregister = mountCanvas(apply, async () => PAGE);
    try {
      const result = await applySurfaceWrite(
        "canvas_item_content",
        JSON.stringify({ command: "str_replace", old_str: "<h1>Mix two liquids</h1>", new_str: "<h1>Mix three liquids</h1>" }),
        { origin: "agent", requestApproval: async () => ({ kind: "approved" }) },
      );
      expect(result.ok).toBe(true);
      expect(apply).toHaveBeenCalledWith(PAGE.replace("Mix two liquids", "Mix three liquids"));
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

describe("an ADDRESSED write reaches every handler phase with its item", () => {
  beforeEach(() => jest.clearAllMocks());

  it("the patch resolves against, and applies to, the named record — not the focused one", async () => {
    const OTHER = "<!doctype html><html><body><h1>Other page</h1></body></html>";
    const item = { resourceType: "html_page", resourceId: "aaaaaaaa-0000-4000-8000-000000000001" };
    const apply = jest.fn();
    const reads: unknown[] = [];
    const readCurrent = jest.fn(async (context?: { item?: typeof item }) => {
      reads.push(context?.item);
      return context?.item?.resourceId === item.resourceId ? OTHER : PAGE;
    });
    const unregister = mountCanvas(apply, readCurrent);
    let proposal: SurfaceWriteApprovalProposal | undefined;
    try {
      const result = await applySurfaceWrite(
        "canvas_item_content",
        { command: "str_replace", old_str: "Other page", new_str: "Other page, edited" },
        {
          origin: "agent",
          item,
          requestApproval: async (p) => {
            proposal = p;
            return { kind: "approved" };
          },
        },
      );
      expect(result.ok).toBe(true);
      expect(proposal?.currentValue).toBe(OTHER);
      expect(apply).toHaveBeenCalledWith(OTHER.replace("Other page", "Other page, edited"), { item });
      expect(reads.every((read) => read === item)).toBe(true);
    } finally {
      unregister();
    }
  });
});
