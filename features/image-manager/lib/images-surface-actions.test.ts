import {
  createExclusiveOperationGate,
  parseVisibleImageSelection,
  pruneImageSelectionToVisible,
  selectVisibleCloudImages,
} from "./images-surface-actions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const visible = [
  { id: "image-a", fileName: "alpha.png" },
  { id: "image-b", fileName: "beta.png" },
];

describe("Images surface action guards", () => {
  it("keeps every image-manager thumbnail on the durable file-id path", () => {
    const durableFileCallers = [
      "components/image/cloud/CloudImageGrid.tsx",
      "components/image/cloud/CloudImageList.tsx",
      "components/image/cloud/CloudFilesBrowserTable.tsx",
      "features/capture-camera/host/CloudLibrarySheet.tsx",
      "features/files/components/multi-view/MultiFileGridViewer.tsx",
      "features/files/components/preview/FileResourceChip.tsx",
      "features/files/components/preview/SelectableFileThumbnail.tsx",
      "features/files/components/surfaces/PickerShell.tsx",
      "features/files/components/surfaces/desktop/FileGridCell.tsx",
      "features/image-manager/components/CloudFileMetadataSheet.tsx",
      "features/resource-manager/resource-picker/FilesResourcePicker.tsx",
    ];

    for (const caller of durableFileCallers) {
      const source = readFileSync(resolve(process.cwd(), caller), "utf8");
      expect(source).toMatch(/file_id: (?:file|thumbnailFile)\.id/);
      expect(source).not.toMatch(
        /thumbnailUrl=\{(?:file|thumbnailFile)\.thumbnailUrl\}/,
      );
    }
  });

  it("normalizes a complete visible selection without changing order", () => {
    expect(
      parseVisibleImageSelection(
        '[" image-b ", "image-a", "image-b"]',
        visible,
      ),
    ).toEqual(["image-b", "image-a"]);
  });

  it("rejects the whole selection when a post-confirmation id is no longer visible", () => {
    expect(() =>
      parseVisibleImageSelection(["image-a", "now-filtered-out"], visible),
    ).toThrow(/selection was left unchanged/i);
  });

  it("allows only one image resolution until the active operation finishes", () => {
    const gate = createExclusiveOperationGate();

    expect(gate.tryStart("image-a")).toBe(true);
    expect(gate.tryStart("image-b")).toBe(false);
    expect(gate.activeId).toBe("image-a");

    gate.finish("image-b");
    expect(gate.activeId).toBe("image-a");

    gate.finish("image-a");
    expect(gate.tryStart("image-b")).toBe(true);
  });

  it("uses the next filter before pruning selection", () => {
    const files = [
      {
        id: "image-a",
        fileName: "alpha.png",
        mimeType: "image/png",
        createdAt: "2026-08-29T10:00:00.000Z",
        updatedAt: "2026-08-29T10:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "image-b",
        fileName: "beta.png",
        mimeType: "image/png",
        createdAt: "2026-08-30T10:00:00.000Z",
        updatedAt: "2026-08-30T10:00:00.000Z",
        deletedAt: null,
      },
    ];

    const nextVisible = selectVisibleCloudImages(files, "beta", null);
    const narrowedSelection = pruneImageSelectionToVisible(
      ["image-a", "image-b"],
      nextVisible,
    );

    expect(nextVisible.map((file) => file.id)).toEqual(["image-b"]);
    expect(narrowedSelection).toEqual(["image-b"]);
    expect(
      pruneImageSelectionToVisible(
        narrowedSelection,
        selectVisibleCloudImages(files, "", null),
      ),
    ).toEqual(["image-b"]);
  });

  it("filters deleted, non-image, and old records before sorting newest first", () => {
    const files = [
      {
        id: "new-image",
        fileName: "new.png",
        mimeType: "image/png",
        createdAt: "2026-08-30T10:00:00.000Z",
        updatedAt: "2026-08-30T10:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "old-image",
        fileName: "old.jpg",
        mimeType: "image/jpeg",
        createdAt: "2026-08-01T10:00:00.000Z",
        updatedAt: "2026-08-01T10:00:00.000Z",
        deletedAt: null,
      },
      {
        id: "deleted-image",
        fileName: "deleted.png",
        mimeType: "image/png",
        createdAt: "2026-08-30T12:00:00.000Z",
        updatedAt: "2026-08-30T12:00:00.000Z",
        deletedAt: "2026-08-30T13:00:00.000Z",
      },
      {
        id: "document",
        fileName: "notes.txt",
        mimeType: "text/plain",
        createdAt: "2026-08-30T14:00:00.000Z",
        updatedAt: "2026-08-30T14:00:00.000Z",
        deletedAt: null,
      },
    ];

    expect(
      selectVisibleCloudImages(
        files,
        "",
        new Date("2026-08-20T00:00:00.000Z").getTime(),
      ).map((file) => file.id),
    ).toEqual(["new-image"]);
  });
});
