const schema = jest.fn();
const getSession = jest.fn();
const requireUserId = jest.fn();
const listForSources = jest.fn();

jest.mock("@/utils/supabase/client", () => ({ supabase: { schema, auth: { getSession } } }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId }));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { listForSources } }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));
jest.mock("@/components/ui/drawer", () => ({ Drawer: ({ children }: { children: React.ReactNode }) => <>{children}</>, DrawerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DrawerDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DrawerFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DrawerHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, DrawerTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1> }));
jest.mock("@/components/ui/button", () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
jest.mock("@/components/ui/label", () => ({ Label: ({ children }: { children: React.ReactNode }) => <label>{children}</label> }));
jest.mock("@/components/ui/scroll-area", () => ({ ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
jest.mock("@ai-matrx/design-system", () => ({ Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} /> }));

import { configureStore } from "@reduxjs/toolkit";
import { enableMapSet } from "immer";
import { Provider } from "react-redux";
import { act } from "react";
import { createRoot } from "react-dom/client";
import notesReducer from "../redux/slice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import { FolderQuickPick } from "./FolderQuickPick";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";

enableMapSet();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-833333333333";

function chain(result: unknown) {
  const value = { select: jest.fn(), eq: jest.fn(), is: jest.fn(), upsert: jest.fn(), insert: jest.fn(), maybeSingle: jest.fn(), single: jest.fn() };
  for (const method of ["select", "eq", "is", "upsert", "insert"] as const) value[method].mockReturnValue(value);
  value.maybeSingle.mockResolvedValue(result);
  value.single.mockResolvedValue(result);
  return value;
}

function store() {
  const userAuth = (state: Pick<UserAuthState, "id"> = { id: USER }) => state;
  return configureStore({
    reducer: { notes: notesReducer, appContext: appContextReducer, userAuth },
    preloadedState: { appContext: { organization_id: ORG_A, organization_name: null, personal_organization_id: null, scope_selections: {}, active_scope_type_ids: [], project_id: null, project_name: null, task_id: null, task_name: null, conversation_id: null, orgBootstrapResolved: true } },
    middleware: (defaults) => defaults({ serializableCheck: false }),
  });
}

describe("FolderQuickPick legacy cross-org folder collision", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    requireUserId.mockReturnValue(USER);
    getSession.mockResolvedValue({ data: { session: { user: { id: USER } } }, error: null });
    listForSources.mockResolvedValue({ ok: true, data: { edges: [] } });
  });

  it("keeps typed input and an actionable retry after the real service rejects a legacy org-B collision", async () => {
    const upsert = chain({ data: null, error: { code: "23505", message: "duplicate legacy key" } });
    const orgRead = chain({ data: null, error: null });
    const crossOrgRead = chain({ data: { id: "folder-b", organization_id: ORG_B }, error: null });
    const from = jest.fn().mockReturnValueOnce(upsert).mockReturnValueOnce(orgRead).mockReturnValueOnce(crossOrgRead);
    schema.mockReturnValue({ from });
    const configured = store();
    const host = document.createElement("div");
    const root = createRoot(host);
    await act(async () => { root.render(<Provider store={configured}><FolderQuickPick instanceId="collision" /></Provider>); });
    const open = [...host.querySelectorAll("button")].find((button) => button.title === "Create a new folder");
    await act(async () => { open?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    const input = host.querySelector("input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "Reserved name");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      (host.querySelector("form") as HTMLFormElement).requestSubmit();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(configured.getState().notes.notes).toEqual({});
    expect(host.textContent).toContain("notes_folder_cross_org_legacy_key");
    expect(input.value).toBe("Reserved name");
    expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { root.unmount(); });
  });
});
