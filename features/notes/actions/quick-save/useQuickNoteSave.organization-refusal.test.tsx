import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockEnsureOrganizationContext = jest.fn();
const mockSavePending = jest.fn();
const mockRunTrackedRequest = jest.fn();
const mockCreateNewNote = jest.fn();
const mockSaveNoteField = jest.fn();
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
let state: { notes: Array<Record<string, unknown>>; organizationId: string | null };
const dispatch = jest.fn((value) => value);
let api: ReturnType<typeof import("./useQuickNoteSave").useQuickNoteSave> | null = null;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (value: unknown) => unknown) => selector({}),
}));
jest.mock("@/features/notes/redux/selectors", () => ({
  selectAllNotesList: () => state.notes,
  selectAllFolders: () => [],
  selectNotesListStatus: () => "ready",
  selectNotesByFolder: () => () => [],
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({ selectOrganizationId: () => state.organizationId }));
jest.mock("@/features/notes/redux/thunks", () => ({ fetchNotesList: jest.fn(), createNewNote: mockCreateNewNote, saveNoteField: mockSaveNoteField }));
jest.mock("@/hooks/useToastManager", () => ({ useToastManager: () => ({ error: mockToastError, success: mockToastSuccess }) }));
jest.mock("@/components/content-refine/useRefinableContent", () => ({
  useRefinableContent: ({ initialContent }: { initialContent: string }) => ({ workingContent: initialContent, initialContent, resetTransforms: jest.fn() }),
}));
jest.mock("@/lib/persistence/payloadSafetyStore", () => ({ payloadSafetyStore: { savePending: mockSavePending } }));
jest.mock("@/lib/redux/net/runTrackedRequest", () => ({ runTrackedRequest: mockRunTrackedRequest }));
jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationContext: mockEnsureOrganizationContext,
  isOrganizationSelectionCancelled: (error: unknown) => error instanceof Error && error.name === "OrganizationSelectionCancelled",
  OrganizationSelectionCancelled: class OrganizationSelectionCancelled extends Error { constructor() { super(); this.name = "OrganizationSelectionCancelled"; } },
}));

import { useQuickNoteSave } from "./useQuickNoteSave";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Probe() { api = useQuickNoteSave({ initialContent: "captured text", defaultFolder: "Scratch", defaultNoteName: "Captured" }); return null; }

describe("useQuickNoteSave organization refusal", () => {
  let host: HTMLDivElement; let root: Root;
  beforeEach(async () => {
    state = { notes: [], organizationId: "org-a" }; api = null; jest.clearAllMocks();
    mockSavePending.mockResolvedValue("recovery");
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
    await act(async () => { root.render(<Probe />); });
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("cancels create before recovery or write I/O and retains the input", async () => {
    mockEnsureOrganizationContext.mockRejectedValue(Object.assign(new Error(), { name: "OrganizationSelectionCancelled" }));
    let result: unknown;
    await act(async () => { result = await api!.save(); });
    expect(result).toBeNull();
    expect(mockSavePending).not.toHaveBeenCalled();
    expect(mockRunTrackedRequest).not.toHaveBeenCalled();
    expect(mockCreateNewNote).not.toHaveBeenCalled();
    expect(mockToastError).not.toHaveBeenCalled();
    expect(api!.workingContent).toBe("captured text");
    expect(api!.isSaving).toBe(false);
  });

  it("refuses an update missing its stored organization without picker or write I/O", async () => {
    state.notes = [{ id: "note-a", label: "A", content: "before", organization_id: null }];
    await act(async () => { root.render(<Probe />); });
    await act(async () => { api!.setMode("update"); });
    await act(async () => { api!.setSelectedNoteId("note-a"); });
    let result: unknown;
    await act(async () => { result = await api!.save(); });
    expect(result).toBeNull();
    expect(mockEnsureOrganizationContext).not.toHaveBeenCalled();
    expect(mockSavePending).not.toHaveBeenCalled();
    expect(mockRunTrackedRequest).not.toHaveBeenCalled();
    expect(mockToastError).toHaveBeenCalledWith(expect.stringMatching(/missing.*organization/i));
    expect(api!.workingContent).toBe("captured text");
  });
});
