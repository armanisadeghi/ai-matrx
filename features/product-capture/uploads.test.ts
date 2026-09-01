import { fileHandler } from "@/features/files/handler/handler";

import {
  countFileLinks,
  isActiveCloudFile,
  listItemFiles,
  unlinkFile,
} from "./service";
import { removeItemFile } from "./uploads";

jest.mock("@/features/files/handler/handler", () => ({
  fileHandler: { remove: jest.fn() },
}));

jest.mock("./service", () => ({
  countFileLinks: jest.fn(),
  isActiveCloudFile: jest.fn(),
  linkFile: jest.fn(),
  listItemFiles: jest.fn(),
  unlinkFile: jest.fn(),
}));

const mockRemove = jest.mocked(fileHandler.remove);
const mockCountFileLinks = jest.mocked(countFileLinks);
const mockIsActiveCloudFile = jest.mocked(isActiveCloudFile);
const mockListItemFiles = jest.mocked(listItemFiles);
const mockUnlinkFile = jest.mocked(unlinkFile);

describe("removeItemFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListItemFiles.mockResolvedValue([]);
    mockIsActiveCloudFile.mockResolvedValue(true);
    mockRemove.mockResolvedValue(undefined);
    mockUnlinkFile.mockResolvedValue(undefined);
  });

  it("unlinks only this item when a deduplicated file has another live link", async () => {
    mockCountFileLinks.mockResolvedValue(2);

    await removeItemFile({
      itemId: "item-b",
      fileId: "shared-file",
      linkId: "link-b",
    });

    expect(mockUnlinkFile).toHaveBeenCalledWith("link-b");
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockIsActiveCloudFile).not.toHaveBeenCalled();
  });

  it("does not delete a file when the supplied relation is already absent", async () => {
    mockCountFileLinks.mockResolvedValue(0);

    await removeItemFile({
      itemId: "item-a",
      fileId: "unlinked-file",
      linkId: "missing-link",
    });

    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockUnlinkFile).not.toHaveBeenCalled();
    expect(mockIsActiveCloudFile).not.toHaveBeenCalled();
  });

  it("deletes a sole active file before unlinking its relation", async () => {
    const order: string[] = [];
    mockCountFileLinks.mockResolvedValue(1);
    mockRemove.mockImplementation(async () => {
      order.push("file");
    });
    mockUnlinkFile.mockImplementation(async () => {
      order.push("link");
    });

    await removeItemFile({
      itemId: "item-a",
      fileId: "sole-file",
      linkId: "sole-link",
    });

    expect(order).toEqual(["file", "link"]);
  });

  it("idempotently unlinks a stale relation whose file is already deleted", async () => {
    mockCountFileLinks.mockResolvedValue(1);
    mockIsActiveCloudFile.mockResolvedValue(false);

    await removeItemFile({
      itemId: "item-a",
      fileId: "deleted-file",
      linkId: "stale-link",
    });

    expect(mockUnlinkFile).toHaveBeenCalledWith("stale-link");
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("does not commit the unlink when deleting a sole active file fails", async () => {
    mockCountFileLinks.mockResolvedValue(1);
    mockRemove.mockRejectedValue(new Error("storage unavailable"));

    await expect(
      removeItemFile({
        itemId: "item-a",
        fileId: "sole-file",
        linkId: "sole-link",
      }),
    ).rejects.toThrow("storage unavailable");

    expect(mockUnlinkFile).not.toHaveBeenCalled();
  });

  it("is a no-op when this item has no matching relation", async () => {
    await removeItemFile({ itemId: "item-a", fileId: "unlinked-file" });

    expect(mockCountFileLinks).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(mockUnlinkFile).not.toHaveBeenCalled();
  });
});
