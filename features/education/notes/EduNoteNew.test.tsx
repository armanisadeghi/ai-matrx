import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { makeAppContextState } from "@/lib/redux/slices/appContextSlice";

const replace = jest.fn();
const create = jest.fn();
let organizationId: string | null = null;
let organizationBootstrapResolved = false;
/** THE FOURTH STATE (R37): why the organization read has no answer at all. */
let organizationReadFailure: string | null = null;

const reduxState = () =>
  ({
    appContext: makeAppContextState({
      organization_id: organizationId,
      orgBootstrapResolved: organizationBootstrapResolved,
      orgBootstrapFailure: organizationReadFailure,
    }),
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
    organizationReadFailure = null;
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
    expect(host.textContent).toContain("An organization is needed for a new education note");
    expect(create).not.toHaveBeenCalled();
  });

  /**
   * 🚨 THE FOREVER SPINNER (R37, the fourth state). This page's only other
   * content is a spinner reading "Creating your note…", and the boolean pair it
   * used to gate on could not name a FAILED organization read: with
   * `orgBootstrapFailure` set, `organizationRequired` is false (the nudge is a
   * claim about memberships nobody read) and `canLoad` is false, so no note was
   * ever created and the page said it was creating one — for as long as the tab
   * stayed open. On the prior bytes this test finds that spinner and no notice.
   */
  it("says we could not check when the organization read FAILED — never 'Creating your note…' forever", async () => {
    organizationBootstrapResolved = true;
    organizationReadFailure = "the organization read failed: Failed to fetch";

    await act(async () => {
      root.render(<EduNoteNew />);
    });

    expect(host.querySelector('[data-testid="organization-unavailable-notice"]')).not.toBeNull();
    expect(host.textContent).toContain("We could not check your organization");
    // Not the refusal — nobody read this person's memberships.
    expect(host.querySelector('[data-testid="organization-required-notice"]')).toBeNull();
    // And not the lie that work is in progress.
    expect(host.textContent).not.toContain("Creating your note…");
    expect(create).not.toHaveBeenCalled();
  });
});
