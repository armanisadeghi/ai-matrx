import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const replace = jest.fn();
const create = jest.fn();
let organizationId: string | null = null;
let organizationBootstrapResolved = false;

const reduxState = () =>
  ({
    appContext: {
      organization_id: organizationId,
      organization_name: null,
      personal_organization_id: null,
      scope_selections: {},
      active_scope_type_ids: [],
      project_id: null,
      project_name: null,
      task_id: null,
      task_name: null,
      conversation_id: null,
      orgBootstrapResolved: organizationBootstrapResolved,
    },
    scopesTree: {
      organizations: {},
      organizationIds: [],
      treeStatus: "idle",
      treeError: null,
      treeFetchedAt: null,
    },
    userAuth: { id: null },
    userPreferences: { organization: { defaultOrganizationId: null } },
  }) as never;

jest.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector(reduxState()),
  useAppDispatch: () => jest.fn(),
  useAppStore: () => ({ getState: reduxState }),
}));
jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: { create },
}));

import { EduNoteNew } from "./EduNoteNew";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("EduNoteNew organization hydration", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    organizationId = null;
    organizationBootstrapResolved = false;
    replace.mockReset();
    create.mockReset().mockResolvedValue({ id: "note-after-hydration" });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("creates exactly once after a null organization hydrates", async () => {
    await act(async () => {
      root.render(<EduNoteNew />);
    });
    expect(create).not.toHaveBeenCalled();

    organizationId = "66666666-6666-4666-8666-666666666666";
    await act(async () => {
      root.render(<EduNoteNew />);
    });
    await act(async () => undefined);

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      label: "Untitled note",
      content: "",
      organization_id: organizationId,
    });
    expect(replace).toHaveBeenCalledWith("/education/notes/note-after-hydration");

    await act(async () => {
      root.render(<EduNoteNew />);
    });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("shows the organization remedy and sends no create after settled absence", async () => {
    organizationBootstrapResolved = true;

    await act(async () => {
      root.render(<EduNoteNew />);
    });

    expect(host.querySelector('[data-testid="organization-required-notice"]')).not.toBeNull();
    expect(host.textContent).toContain("new education note need an organization");
    expect(create).not.toHaveBeenCalled();
  });
});
