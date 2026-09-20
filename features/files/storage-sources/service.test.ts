import { BackendApiError } from "@/lib/api/errors";
import {
  browseStorageSource,
  collisionRenameProposal,
  importStorageSourceFiles,
  safeStorageBasename,
  validateStorageDestinationFolderPath,
} from "@/features/files/storage-sources/service";

const mockApiPost = jest.fn();
const mockGetFile = jest.fn();

jest.mock("@/lib/api/typed-client", () => ({
  apiPost: (...args: unknown[]) => mockApiPost(...args),
}));
jest.mock("@/features/files/api/files", () => ({
  getFile: (...args: unknown[]) => mockGetFile(...args),
}));
jest.mock("@/features/files/redux/converters", () => ({
  apiFileRecordToCloudFile: (row: unknown) => row,
}));

beforeEach(() => jest.clearAllMocks());

test.each(["google_drive", "onedrive", "dropbox", "box"] as const)(
  "%s import sends the typed provider payload and hydrates the authoritative row",
  async (provider) => {
    mockApiPost.mockResolvedValue({
      data: {
        file_id: `file-${provider}`,
        file_path: "My Files/Imports/file.txt",
        checksum: null,
        version_number: 1,
        created: true,
        source: { provider, connection_id: "connection-1", source_ref: "source-1" },
      },
    });
    mockGetFile.mockResolvedValue({ data: { id: `file-${provider}`, fileName: "file.txt" } });

    const result = await importStorageSourceFiles({
      provider,
      connectionId: "connection-1",
      selections: [{ sourceRef: "source-1", name: "file.txt" }],
    });

    expect(mockApiPost).toHaveBeenCalledWith("/storage-sources/import", {
      provider,
      connection_id: "connection-1",
      source_ref: "source-1",
      file_path: "My Files/Imports/file.txt",
      visibility: "personal",
    });
    expect(mockGetFile).toHaveBeenCalledWith(`file-${provider}`);
    expect(result.files[0]?.fileId).toBe(`file-${provider}`);
  },
);

test("browse sends the exact contract payload without provider URLs or tokens", async () => {
  mockApiPost.mockResolvedValue({
    data: {
      provider: "dropbox",
      connection_id: "connection-1",
      folder_ref: "folder-1",
      items: [],
      next_cursor: "opaque-cursor",
    },
  });
  const page = await browseStorageSource({
    provider: "dropbox",
    connectionId: "connection-1",
    folderRef: "folder-1",
    cursor: "opaque-before",
  });
  expect(mockApiPost).toHaveBeenCalledWith(
    "/storage-sources/browse",
    {
      provider: "dropbox",
      connection_id: "connection-1",
      folder_ref: "folder-1",
      cursor: "opaque-before",
      page_size: 50,
    },
  );
  expect(JSON.stringify(page)).not.toMatch(/url|token/i);
});

test("browse refuses a page for a different provider account or folder", async () => {
  mockApiPost.mockResolvedValue({
    data: {
      provider: "box",
      connection_id: "other-connection",
      folder_ref: "other-folder",
      items: [],
      next_cursor: null,
    },
  });
  await expect(
    browseStorageSource({
      provider: "dropbox",
      connectionId: "connection-1",
      folderRef: "folder-1",
    }),
  ).rejects.toThrow("different location");
});

test("a different-source collision proposes a stable basename and never overwrites", async () => {
  mockApiPost.mockRejectedValue(
    new BackendApiError({
      code: "conflict",
      detail: "different source",
      userMessage: "A different provider file already uses this path.",
      status: 409,
    }),
  );
  const selection = { sourceRef: "source-7", name: "report.final.pdf" };
  const result = await importStorageSourceFiles({
    provider: "box",
    connectionId: "connection-1",
    selections: [selection],
  });
  expect(result.files).toEqual([]);
  expect(result.failures[0]?.collisionProposal).toBe(
    collisionRenameProposal("box", "connection-1", selection),
  );
  expect(result.failures[0]?.collisionProposal).toMatch(/^report\.final-[0-9a-f]{8}\.pdf$/);
  expect(mockApiPost).toHaveBeenCalledTimes(1);
});

test("a confirmed collision retry keeps the exact edited destination name", async () => {
  mockApiPost.mockResolvedValue({
    data: {
      file_id: "file-retried",
      file_path: "My Files/Imports/report-confirmed.pdf",
      checksum: "checksum-1",
      version_number: 1,
      created: true,
      source: { provider: "box", connection_id: "connection-1", source_ref: "source-7" },
    },
  });
  mockGetFile.mockResolvedValue({ data: { id: "file-retried", fileName: "report-confirmed.pdf" } });

  await importStorageSourceFiles({
    provider: "box",
    connectionId: "connection-1",
    selections: [{
      sourceRef: "source-7",
      name: "report.pdf",
      destinationName: "report-confirmed.pdf",
    }],
  });

  expect(mockApiPost).toHaveBeenCalledWith(
    "/storage-sources/import",
    expect.objectContaining({ file_path: "My Files/Imports/report-confirmed.pdf" }),
  );
});

test("destination and confirmed collision names fail before a request", () => {
  expect(validateStorageDestinationFolderPath("My Files/../Other")).toBeTruthy();
  expect(validateStorageDestinationFolderPath("My Files/Imports")).toBeNull();
  expect(safeStorageBasename("copy/report.pdf")).toBeNull();
  expect(safeStorageBasename("report.pdf")).toBe("report.pdf");
});

test("cancel settlement stops scheduling the next provider import", async () => {
  let keepGoing = true;
  mockApiPost.mockImplementation(async () => {
    keepGoing = false;
    return {
      data: {
        file_id: "file-1",
        file_path: "My Files/Imports/a.txt",
        checksum: null,
        version_number: 1,
        created: true,
        source: {
          provider: "dropbox",
          connection_id: "connection-1",
          source_ref: "a",
        },
      },
    };
  });
  mockGetFile.mockResolvedValue({ data: { id: "file-1", fileName: "a.txt" } });
  const result = await importStorageSourceFiles({
    provider: "dropbox",
    connectionId: "connection-1",
    selections: [
      { sourceRef: "a", name: "a.txt" },
      { sourceRef: "b", name: "b.txt" },
    ],
    shouldContinue: () => keepGoing,
  });
  expect(result.files).toHaveLength(1);
  expect(mockApiPost).toHaveBeenCalledTimes(1);
});
