import { renderHook } from "@/test-utils/renderHook";
import type { Resource } from "@/features/agents/resources/types";

const add = jest.fn(async () => ({ ok: true }));
const dispatch = jest.fn();
const state = {};
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => dispatch, useAppStore: () => ({ getState: () => state }) }));
jest.mock("@/features/scopes/host/associationsStore", () => ({ getAssociationsStore: () => ({ add, remove: jest.fn(), load: jest.fn(), getEdges: () => ({ status: "ready", edges: [] }) }) }));
jest.mock("@/features/agents/redux/execution-system/conversations/conversations.selectors", () => ({ selectIsCacheOnly: () => () => false }));
jest.mock("@/features/agents/redux/execution-system/instance-resources/resource-source", () => ({ refineBlockType: (x: unknown) => x, resourceDataToSource: () => null }));
jest.mock("@/features/agents/redux/execution-system/instance-resources/editable-resource-types", () => ({ isEditableCapableBlockType: () => false }));
jest.mock("@/features/agents/redux/execution-system/instance-resources/instance-resources.slice", () => ({ addResource: jest.fn(() => ({ type: "add" })), removeResource: jest.fn(), setResourcePreview: jest.fn() }));
jest.mock("@/features/agents/components/inputs/resources/attached-documents", () => ({ cleanDocumentLabel: (x: string) => x, documentAttachLabelFromState: () => "Document" }));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn() } }));

import { useAttachResource } from "./attach-resource";

const text: Extract<Resource, { type: "text" }> = { type: "text", data: { id: "synthetic", label: "Text", text: "bytes" } };
// The hook only reads identity/label for these foreign record references.
const note = { type: "note", data: { id: "note-1", label: "Note" } } as unknown as Extract<Resource, { type: "note" }>;
const task = { type: "task", data: { id: "task-1", title: "Task" } } as unknown as Extract<Resource, { type: "task" }>;
const file: Extract<Resource, { type: "file" }> = { type: "file", data: { id: "file-1", details: { filename: "a.txt" } } };

describe("useAttachResource file edges", () => {
  beforeEach(() => { jest.clearAllMocks(); });
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
