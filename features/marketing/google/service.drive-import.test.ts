const mockGetSession = jest.fn();
const mockGetState = jest.fn();
const mockGetFile = jest.fn();

jest.mock("@/utils/supabase/client", () => {
  const client = { auth: { getSession: (...args: unknown[]) => mockGetSession(...args) } };
  return { createClient: () => client, supabase: client };
});
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: mockGetState }),
}));
jest.mock("@/features/files/api/files", () => ({
  getFile: (...args: unknown[]) => mockGetFile(...args),
}));

import { CHOSEN_ORG, mockFetchJson, resetGate, selectOrganization } from "@/lib/organization/__tests__/gate-harness";
import { browseGoogleDrive, checkGoogleDriveFileAccess, importSelectedGoogleDriveFile } from "./service";

const chosen = {
  organizationId: CHOSEN_ORG,
  connectionId: "connection-harbor",
  fileId: "drive-intake-guide",
  filePath: "My Files/Imports/New patient intake guide.docx",
};

function result(sourceRef: string) {
  return {
    file_id: "saved-intake-guide",
    file_path: chosen.filePath,
    checksum: null,
    version_number: 1,
    created: true,
    source: {
      provider: "google_drive",
      connection_id: chosen.connectionId,
      source_ref: sourceRef,
    },
  };
}

beforeEach(() => {
  jest.resetAllMocks();
  resetGate();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: "jwt" } } });
  selectOrganization(mockGetState, chosen.organizationId);
  mockGetFile.mockResolvedValue({ data: { id: "saved-intake-guide" } });
});

afterEach(resetGate);

it("sends the chosen file, source connection and destination organization to the import route", async () => {
  const fetchMock = mockFetchJson(result(chosen.fileId));
  await expect(importSelectedGoogleDriveFile(chosen)).resolves.toMatchObject(result(chosen.fileId));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toContain("/google-sync/drive/import");
  expect(JSON.parse(init.body as string)).toEqual({
    organization_id: chosen.organizationId,
    connection_id: chosen.connectionId,
    file_id: chosen.fileId,
    file_path: chosen.filePath,
    resource_key: null,
  });
  expect(mockGetFile).toHaveBeenCalledWith("saved-intake-guide");
});

it("refuses a success response that names a different Google file", async () => {
  mockFetchJson(result("drive-another-patient"));
  await expect(importSelectedGoogleDriveFile(chosen)).rejects.toThrow(
    "did not match the selected Google file",
  );
  expect(mockGetFile).not.toHaveBeenCalled();
});

it("refuses a response that cannot be confirmed as the saved Matrx file", async () => {
  mockFetchJson(result(chosen.fileId));
  mockGetFile.mockResolvedValue({ data: { id: "different-saved-file" } });
  await expect(importSelectedGoogleDriveFile(chosen)).rejects.toThrow(
    "returned a different file",
  );
});

// Exercise the real transport, not the component's mocked service functions.
it.each(["review-key", "different-review-key"])("preserves resource key %s through all Drive wire requests", async (resourceKey) => {
  const fetchMock = mockFetchJson({ files: [], next_page_token: null });
  await browseGoogleDrive({ ...chosen, folderId: "shared-folder", pageToken: "second-page", resourceKey });
  expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
    organization_id: chosen.organizationId, connection_id: chosen.connectionId,
    search: null, folder_id: "shared-folder", page_token: "second-page", resource_key: resourceKey,
  });

  fetchMock.mockClear();
  await checkGoogleDriveFileAccess({ ...chosen, resourceKey });
  expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({
    organization_id: chosen.organizationId, connection_id: chosen.connectionId,
    file_id: chosen.fileId, resource_key: resourceKey,
  });

  const importFetch = mockFetchJson(result(chosen.fileId));
  await importSelectedGoogleDriveFile({ ...chosen, resourceKey });
  expect(JSON.parse((importFetch.mock.calls[0][1] as RequestInit).body as string)).toEqual({
    organization_id: chosen.organizationId, connection_id: chosen.connectionId,
    file_id: chosen.fileId, file_path: chosen.filePath, resource_key: resourceKey,
  });
});
