/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import GoogleContactsImportWindow from "./GoogleContactsImportWindow";

let admission = { isSuperAdmin: false, email: "ordinary@mail.invalid" };
const contactsProps = jest.fn();
const directoryProps = jest.fn();

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectIsSuperAdmin: () => admission.isSuperAdmin,
  // 9b938b6a0f: the window asks the registered admin feature "google.internal-review", not the raw admin selector.
  selectAdminFeature: () => admission.isSuperAdmin,
  selectUserEmail: () => admission.email,
}));
jest.mock("@/features/window-panels/WindowPanel", () => ({
  WindowPanel: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock("@/features/connectors/import/GoogleContactsImportPanel", () => ({
  GoogleContactsImportPanel: (props: {
    organizationId: string | null;
    initialExternalId: string | null;
  }) => {
    contactsProps(props);
    return <div>Contacts import body</div>;
  },
}));
jest.mock("@/features/google-workspace/directory/DirectoryReview", () => ({
  DirectoryReview: (props: { organizationId: string | null }) => {
    directoryProps(props);
    return <div>Canonical Directory body</div>;
  },
}));

describe("GoogleContactsImportWindow Directory tab", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    admission = { isSuperAdmin: false, email: "ordinary@mail.invalid" };
    contactsProps.mockClear();
    directoryProps.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  const render = (initialView: "contacts" | "directory" = "contacts") => {
    act(() =>
      root.render(
        <GoogleContactsImportWindow
          isOpen
          onClose={() => undefined}
          organizationId="org-harbor"
          initialExternalId="google-person-harbor"
          initialView={initialView}
        />,
      ),
    );
  };

  it("keeps Contacts as the default with its launch context unchanged", () => {
    render();
    expect(host.textContent).toContain("Contacts import body");
    expect(host.textContent).not.toContain("Directory");
    expect(contactsProps).toHaveBeenLastCalledWith({
      organizationId: "org-harbor",
      initialExternalId: "google-person-harbor",
    });
    expect(directoryProps).not.toHaveBeenCalled();
  });

  it("shows the canonical Directory body only after the named reviewer selects its tab", () => {
    admission = { isSuperAdmin: false, email: "oauth-review@aimatrx.com" };
    render();
    expect(host.textContent).toContain("Contacts import body");
    expect(host.textContent).not.toContain("Canonical Directory body");

    const directoryTab = [...host.querySelectorAll("button")].find(
      (item) => item.textContent === "Directory",
    );
    expect(directoryTab).toBeInstanceOf(HTMLButtonElement);
    act(() => directoryTab?.click());
    expect(host.textContent).toContain("Canonical Directory body");
    expect(directoryProps).toHaveBeenLastCalledWith({
      organizationId: "org-harbor",
    });
  });

  it("opens Directory first for an eligible launch and follows later launch data", () => {
    admission = { isSuperAdmin: false, email: "oauth-review@aimatrx.com" };
    render("directory");
    expect(host.textContent).toContain("Canonical Directory body");
    expect(directoryProps).toHaveBeenLastCalledWith({
      organizationId: "org-harbor",
    });

    render("contacts");
    expect(host.textContent).toContain("Contacts import body");
    expect(host.textContent).not.toContain("Canonical Directory body");
  });

  it("falls back to Contacts when an ineligible launch asks for Directory", () => {
    render("directory");
    expect(host.textContent).toContain("Contacts import body");
    expect(host.textContent).not.toContain("Directory");
    expect(directoryProps).not.toHaveBeenCalled();
  });

  it("returns to Contacts when reviewer eligibility is lost", () => {
    admission = { isSuperAdmin: false, email: "oauth-review@aimatrx.com" };
    render();
    const directoryTab = [...host.querySelectorAll("button")].find(
      (item) => item.textContent === "Directory",
    );
    act(() => directoryTab?.click());
    expect(host.textContent).toContain("Canonical Directory body");

    admission = { isSuperAdmin: false, email: "ordinary@mail.invalid" };
    render();
    expect(host.textContent).toContain("Contacts import body");
    expect(host.textContent).not.toContain("Canonical Directory body");
    expect(host.textContent).not.toContain("Directory");
  });
});
