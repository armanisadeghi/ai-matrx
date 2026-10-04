/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { DriveBrowsePage } from "@/features/marketing/google/service";
import { GoogleDriveLibrary } from "./GoogleDriveLibrary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockBrowse = jest.fn();
const mockImportFile = jest.fn();
const mockOrganization = jest.fn();
const mockOpenFilePreview = jest.fn();

jest.mock("@/features/marketing/google/service", () => ({
  browseGoogleDrive: (...args: unknown[]) => mockBrowse(...args),
  checkGoogleDriveFileAccess: jest.fn(),
  importSelectedGoogleDriveFile: (...args: unknown[]) => mockImportFile(...args),
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleCapabilities: () => ({ data: [{ key: "drive_browse", rollout_phase: "internal_test", eligible: true }] }),
  useGoogleConnectionInventory: () => ({ data: { connections: [
    { id: "connection-harbor", account_email: "records@harbordental.test", organization_id: null },
    { id: "connection-river", account_email: "records@riverdental.test", organization_id: null },
  ] } }),
}));
jest.mock("@/features/google-workspace/connection", () => ({
  eligibleGoogleConnections: (connections: unknown[]) => connections,
}));
jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: ({ onConnectionChange, disabled }: { onConnectionChange: (value: string) => void; disabled: boolean }) => (
    <select aria-label="Google account to review" disabled={disabled} onChange={(event) => onConnectionChange(event.target.value)}>
      <option value="">Choose account</option>
      <option value="connection-harbor">Harbor Dental</option>
      <option value="connection-river">River Dental</option>
    </select>
  ),
}));
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => mockOrganization(),
}));
jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => "Harbor Dental" }));
jest.mock("@/features/files/components/preview/openFilePreview", () => ({
  openFilePreview: (...args: unknown[]) => mockOpenFilePreview(...args),
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({ ErrorAlchemyMenu: () => null }));

const page: DriveBrowsePage = {
  connection_id: "connection-harbor",
  source_account: "records@harbordental.test",
  source_owner_type: "user",
  source_owner_id: "owner-harbor",
  next_page_token: null,
  incomplete_search: false,
  files: [{
    id: "drive-intake-guide",
    name: "New patient intake guide",
    mime_type: "application/vnd.google-apps.document",
    modified_at: null,
    web_view_link: null,
    owners: [],
    shared_drive: false,
  }, {
    id: "drive-intake-folder",
    name: "Intake forms",
    mime_type: "application/vnd.google-apps.folder",
    modified_at: null,
    web_view_link: null,
    owners: [],
    shared_drive: false,
  }, {
    id: "drive-intake-shortcut",
    name: "Intake shortcut",
    mime_type: "application/vnd.google-apps.shortcut",
    modified_at: null,
    web_view_link: null,
    owners: [],
    shared_drive: false,
  }],
};

let container: HTMLDivElement;
let root: Root;

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((element) => element.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

async function click(element: HTMLElement) {
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
}

async function chooseAccount(value = "connection-harbor") {
  const select = container.querySelector("select");
  if (!select) throw new Error("Missing Google account selector");
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function showFiles() {
  await chooseAccount();
  await click(button("Browse all accessible Drive files"));
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockBrowse.mockReset().mockResolvedValue(page);
  mockImportFile.mockReset();
  mockOrganization.mockReset().mockReturnValue({ organizationId: "destination-harbor" });
  mockOpenFilePreview.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("never imports while browsing or selecting a Drive file", async () => {
  await act(async () => root.render(<GoogleDriveLibrary />));
  await showFiles();
  await click(button("Save to Matrx Files"));
  expect(mockImportFile).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLInputElement>('input[aria-label="Matrx Files destination path"]')?.value)
    .toBe("My Files/Imports/New patient intake guide.docx");
  expect(container.textContent).toContain("records@harbordental.test");
  expect(container.textContent).toContain("Destination organization: Harbor Dental");
  expect(container.textContent).toContain("Import unavailable for this file type");
});

it("imports the one selected file to the explicit destination and opens its saved copy", async () => {
  mockImportFile.mockResolvedValue({
    file_id: "saved-intake-guide",
    file_path: "My Files/Imports/New patient intake guide.docx",
    version_number: 1,
    created: true,
    source: { provider: "google_drive", connection_id: "connection-harbor", source_ref: "drive-intake-guide" },
  });
  await act(async () => root.render(<GoogleDriveLibrary />));
  await showFiles();
  await click(button("Save to Matrx Files"));
  await click(button("Import selected file"));
  expect(mockImportFile).toHaveBeenCalledTimes(1);
  expect(mockImportFile).toHaveBeenCalledWith({
    organizationId: "destination-harbor",
    connectionId: "connection-harbor",
    fileId: "drive-intake-guide",
    filePath: "My Files/Imports/New patient intake guide.docx",
  });
  expect(container.textContent).toContain("Saved to Matrx Files");
  await click(button("Open saved file"));
  expect(mockOpenFilePreview).toHaveBeenCalledWith("saved-intake-guide");
  await chooseAccount("connection-river");
  expect(container.textContent).not.toContain("Saved to Matrx Files");
});

it("does not blindly resend an uncertain import", async () => {
  mockImportFile.mockRejectedValue(new Error("The connection closed after the request."));
  await act(async () => root.render(<GoogleDriveLibrary />));
  await showFiles();
  await click(button("Save to Matrx Files"));
  await click(button("Import selected file"));
  await click(button("Import selected file"));
  expect(mockImportFile).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Check Matrx Files");
  expect(button("Import selected file").disabled).toBe(true);
  await chooseAccount("connection-river");
  expect(container.textContent).toContain("Import not confirmed");
  expect(container.textContent).toContain("records@harbordental.test");
});

it("drops a selected file when the Google account changes", async () => {
  await act(async () => root.render(<GoogleDriveLibrary />));
  await showFiles();
  await click(button("Save to Matrx Files"));
  await chooseAccount("connection-river");
  expect(container.textContent).not.toContain("Import selected file");
  expect(mockImportFile).not.toHaveBeenCalled();
});

it("blocks a second import while the first request is in flight", async () => {
  let finish: ((value: unknown) => void) | undefined;
  mockImportFile.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => root.render(<GoogleDriveLibrary />));
  await showFiles();
  await click(button("Save to Matrx Files"));
  await act(async () => {
    button("Import selected file").click();
  });
  expect(button("Import selected file").disabled).toBe(true);
  button("Import selected file").click();
  expect(mockImportFile).toHaveBeenCalledTimes(1);
  await act(async () => finish?.({
    file_id: "saved-intake-guide",
    file_path: "My Files/Imports/New patient intake guide.docx",
    version_number: 1,
    created: true,
    source: { provider: "google_drive", connection_id: "connection-harbor", source_ref: "drive-intake-guide" },
  }));
});
