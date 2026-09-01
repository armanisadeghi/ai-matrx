import * as Files from "@/features/files/api/files";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import {
  selectFileById,
  selectPermissionsForResource,
} from "@/features/files/redux/selectors";
import type { CloudFile } from "@/features/files/types";
import { normalize } from "./input/normalize";
import { resolve } from "./resolver";

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({}) }),
}));
jest.mock("@/features/files/api/files", () => ({ getFile: jest.fn() }));
jest.mock("@/features/files/redux/converters", () => ({
  apiFileRecordToCloudFile: jest.fn(),
}));
jest.mock("@/features/files/redux/selectors", () => ({
  selectFileById: jest.fn(),
  selectPermissionsForResource: jest.fn(() => []),
}));
jest.mock("./intelligence/access", () => ({
  decideForOwnedFile: () => ({
    origin: "owned",
    capabilities: {
      canRead: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
      requiresAuth: true,
      transportSafeForFetch: true,
    },
  }),
}));

const mockedGetFile = jest.mocked(Files.getFile);
const mockedConvert = jest.mocked(apiFileRecordToCloudFile);
const mockedSelectFile = jest.mocked(selectFileById);
const mockedSelectPermissions = jest.mocked(selectPermissionsForResource);

function cloudFile(filePath: string): CloudFile {
  return {
    id: "generated-file-id",
    ownerId: "owner-id",
    filePath,
    fileName: "generated.png",
    mimeType: "image/png",
    fileSize: 3,
    checksum: "abc",
    visibility: "personal",
    currentVersion: 1,
    parentFolderId: null,
    metadata: {},
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    deletedAt: null,
    publicUrl: null,
    url: null,
    cdnUrl: null,
    downloadUrl: null,
    thumbnailUrl: null,
    source: { kind: "real" },
    parentFileId: null,
    derivationKind: null,
    derivationMetadata: null,
    duplicateOfFileId: null,
    canonicalProcessedDocumentId: null,
  };
}

describe("file handler resolver", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedSelectPermissions.mockReturnValue([]);
  });

  it("refreshes an incomplete cached file before a versioned write reads its path", async () => {
    mockedSelectFile.mockReturnValue(
      cloudFile("") as unknown as ReturnType<typeof selectFileById>,
    );
    mockedGetFile.mockResolvedValue({ data: {} } as Awaited<
      ReturnType<typeof Files.getFile>
    >);
    mockedConvert.mockReturnValue(
      cloudFile("generations/images/generated.png"),
    );

    const resolved = await resolve(
      normalize({ kind: "file_id", fileId: "generated-file-id" }),
    );

    expect(mockedGetFile).toHaveBeenCalledWith("generated-file-id");
    expect(mockedConvert).toHaveBeenCalledWith({});
    expect(resolved.filePath).toBe("generations/images/generated.png");
  });
});
