import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const ORGANIZATION_A = "11111111-1111-4111-8111-111111111111";
const ORGANIZATION_B = "22222222-2222-4222-8222-222222222222";
const dispatch = jest.fn();
const choose = jest.fn();
const discard = jest.fn();
const create = jest.fn();
const fetch = jest.fn();
const successToast = jest.fn();
const errorToast = jest.fn();
const drafts = [{ key: "draft-1", entityId: "lost", label: "Draft", content: "kept text" }];
let organizationId: string | null = ORGANIZATION_A;
let notesMap: Record<string, unknown> = {};
let openTabs: string[] = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ userAuth: { id: "user" }, appContext: { organization_id: organizationId } }),
}));
jest.mock("../redux/selectors", () => ({
  selectNotesMap: () => notesMap,
  selectInstanceTabs: () => () => openTabs,
}));
jest.mock("../redux/thunks", () => ({ createNewNote: create, fetchNoteContent: fetch }));
jest.mock("../redux/slice", () => ({
  addInstanceTab: (value: unknown) => value,
  setInstanceActiveTab: (value: unknown) => value,
  markTabInteraction: (value: unknown) => value,
}));
jest.mock("@/lib/organization/organization-gate", () => {
  const actual = jest.requireActual("@/lib/organization/organization-gate");
  return { ...actual, requestOrganizationContextChoice: choose };
});
jest.mock("../utils/notesDrafts", () => ({ listNoteDrafts: () => drafts, discardNoteDraft: discard }));
jest.mock("@ai-matrx/kit/drafts", () => ({ subscribeDrafts: () => () => {}, getDraftsVersion: () => 1 }));
jest.mock("@/lib/toast", () => ({ toast: { success: successToast, error: errorToast } }));

import { NotesDraftRecoveryList } from "./NotesDraftRecoveryList";
import { OrganizationSelectionCancelled } from "@/lib/organization/organization-gate";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("NotesDraftRecoveryList recovery", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    organizationId = ORGANIZATION_A;
    notesMap = {};
    openTabs = [];
    choose.mockReset(); discard.mockReset(); create.mockReset(); fetch.mockReset(); dispatch.mockReset(); successToast.mockReset(); errorToast.mockReset();
    create.mockReturnValue({ type: "create" });
    dispatch.mockImplementation((action: { type?: string }) => ({
      unwrap: () => action.type === "create" ? Promise.resolve({ id: "new" }) : Promise.resolve(),
    }));
    host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  async function render() { await act(async () => { root.render(<NotesDraftRecoveryList instanceId="i" />); }); }
  async function clickPrimaryAction() {
    await act(async () => {
      (host.querySelector("button") as HTMLButtonElement).click();
    });
  }

  function expectDraftRetainedAndReady() {
    expect(host.textContent).toContain("Draft");
    const button = host.querySelector("button") as HTMLButtonElement;
    expect(button.textContent).toBe("Recover as new note");
    expect(button.disabled).toBe(false);
  }

  it("uses an explicit chosen destination and drops only after create", async () => {
    choose.mockResolvedValue(ORGANIZATION_B); await render(); await clickPrimaryAction();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ organization_id: ORGANIZATION_B, content: "kept text" }));
    expect(discard).toHaveBeenCalledWith("lost");
  });
  it("keeps the draft and performs no create when selection cancels", async () => {
    choose.mockRejectedValue(new OrganizationSelectionCancelled()); await render(); await clickPrimaryAction();
    expect(create).not.toHaveBeenCalled(); expect(discard).not.toHaveBeenCalled(); expect(successToast).not.toHaveBeenCalled(); expect(errorToast).not.toHaveBeenCalled();
    expectDraftRetainedAndReady();
  });
  it("keeps the draft when creation fails", async () => {
    choose.mockResolvedValue(ORGANIZATION_B); dispatch.mockReturnValue({ unwrap: () => Promise.reject(new Error("failed")) }); await render(); await clickPrimaryAction();
    expect(discard).not.toHaveBeenCalled(); expect(successToast).not.toHaveBeenCalled(); expect(errorToast).toHaveBeenCalled();
    expectDraftRetainedAndReady();
  });
  it("opens an existing note without an active organization", async () => {
    organizationId = null;
    notesMap = { lost: { id: "lost" } };
    await render(); await clickPrimaryAction();
    expect(choose).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("lost");
    expect(dispatch).toHaveBeenCalledWith({ instanceId: "i", noteId: "lost" });
  });
});
