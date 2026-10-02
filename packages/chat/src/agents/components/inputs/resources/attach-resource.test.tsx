import { renderHook } from "@host/test-utils/renderHook";
import type { Resource } from "../../../resources/types";

const add = jest.fn(async () => ({ ok: true }));
const dispatch = jest.fn();
const state: { instanceResources: { byConversationId: Record<string, Record<string, unknown>> } } = {
  instanceResources: { byConversationId: {} },
};
jest.mock("@host/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch, useAppStore: () => ({ getState: () => state }) }));
jest.mock("@host/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ add, remove: jest.fn(), load: jest.fn(), getEdges: () => ({ status: "ready", edges: [] }) }) }));
jest.mock("../../../redux/execution-system/conversations/conversations.selectors", () => ({ selectIsCacheOnly: () => () => false }));
jest.mock("../../../redux/execution-system/instance-resources/resource-source", () => ({ refineBlockType: (x: unknown) => x, resourceDataToSource: (_t: unknown, data: unknown) => data }));
jest.mock("../../../redux/execution-system/instance-resources/editable-resource-types", () => ({ isEditableCapableBlockType: () => false }));
jest.mock("../../../redux/execution-system/instance-resources/instance-resources.slice", () => ({ addResource: jest.fn(() => ({ type: "add" })), removeResource: jest.fn(), setResourcePreview: jest.fn(), setResourceStatus: jest.fn((p: unknown) => ({ type: "status", payload: p })) }));
jest.mock("./attached-documents", () => ({ cleanDocumentLabel: (x: string) => x, documentAttachLabelFromState: () => "Document" }));
jest.mock("@host/lib/toast", () => ({ toast: { error: jest.fn() } }));

import { useAttachResource } from "./attach-resource";

const text: Extract<Resource, { type: "text" }> = { type: "text", data: { id: "synthetic", label: "Text", text: "bytes" } };
// The hook only reads identity/label for these foreign record references.
const note = { type: "note", data: { id: "note-1", label: "Note" } } as unknown as Extract<Resource, { type: "note" }>;
const task = { type: "task", data: { id: "task-1", title: "Task" } } as unknown as Extract<Resource, { type: "task" }>;
const file: Extract<Resource, { type: "file" }> = { type: "file", data: { id: "file-1", details: { filename: "a.txt" } } };

describe("useAttachResource file edges", () => {
  beforeEach(() => { jest.clearAllMocks(); state.instanceResources.byConversationId = {}; });
  it.each([text, note, task, { ...text, data: { ...text.data, fileId: "not-a-file" } }])("does not create a file edge for $type ids", async (resource) => {
    const handle = await renderHook(() => useAttachResource("conversation-1"));
    try { await handle.act(async () => { await handle.current(resource); }); expect(add).not.toHaveBeenCalled(); }
    finally { await handle.unmount(); }
  });
  it("creates a file edge for canonical file ids", async () => {
    const handle = await renderHook(() => useAttachResource("conversation-1"));
    try { await handle.act(async () => { await handle.current(file); }); expect(add).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "file-1" })); }
    finally { await handle.unmount(); }
  });
});

// PB-01 real test, 2026-10-01: each click on Context values' Assign added the
// same chip again ("Port of Oakland lane · Gate code" ×3). Attach is idempotent.
describe("useAttachResource is idempotent", () => {
  beforeEach(() => { jest.clearAllMocks(); state.instanceResources.byConversationId = {}; });
  it("does not add a second identical per-turn resource", async () => {
    const { addResource } = jest.requireMock("../../../redux/execution-system/instance-resources/instance-resources.slice");
    state.instanceResources.byConversationId["conversation-1"] = {
      existing: { resourceId: "existing", blockType: "input_notes", source: { label: "Note", id: "note-1" } },
    };
    const handle = await renderHook(() => useAttachResource("conversation-1"));
    try { await handle.act(async () => { await handle.current(note); }); expect(addResource).not.toHaveBeenCalled(); }
    finally { await handle.unmount(); }
  });
  it("adds a resource that differs", async () => {
    const { addResource } = jest.requireMock("../../../redux/execution-system/instance-resources/instance-resources.slice");
    state.instanceResources.byConversationId["conversation-1"] = {
      existing: { resourceId: "existing", blockType: "input_notes", source: { id: "note-2", label: "Other" } },
    };
    const handle = await renderHook(() => useAttachResource("conversation-1"));
    try { await handle.act(async () => { await handle.current(note); }); expect(addResource).toHaveBeenCalledTimes(1); }
    finally { await handle.unmount(); }
  });
});

// PB-02/PB-04: a picked file's chip appeared ~5 s later. The chip is placed
// before the durable edge write is even started.
describe("useAttachResource shows the chip before the network answers", () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it("dispatches the chip before the edge write resolves", async () => {
    const order: string[] = [];
    dispatch.mockImplementation((action: { type: string }) => { order.push(action?.type ?? "?"); });
    add.mockImplementationOnce(async () => { order.push("edge-write"); return { ok: true }; });
    const handle = await renderHook(() => useAttachResource("conversation-1"));
    try {
      await handle.act(async () => { await handle.current(file); });
      expect(order.indexOf("add")).toBeGreaterThanOrEqual(0);
      expect(order.indexOf("add")).toBeLessThan(order.indexOf("edge-write"));
    } finally { await handle.unmount(); dispatch.mockReset(); }
  });
});
