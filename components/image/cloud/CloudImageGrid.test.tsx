import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CloudImageGrid } from "@/components/image/cloud/CloudImageGrid";
import type { CloudFileRecord } from "@/features/files/types";

jest.mock("@/features/files/components/core/MediaThumbnail/MediaThumbnail", () => ({
  MediaThumbnail: () => <div data-media-thumbnail="true" />,
}));

const file = {
  id: "image-1",
  fileName: "cover.png",
  mimeType: "image/png",
  fileSize: 1024,
  publicUrl: null,
  deletedAt: null,
  updatedAt: "2026-05-07T10:00:00.000Z",
  createdAt: "2026-05-07T10:00:00.000Z",
} as CloudFileRecord;

describe("CloudImageGrid", () => {
  it("renders a checkbox selection control for each image", () => {
    const html = renderToStaticMarkup(
      <CloudImageGrid
        files={[file]}
        density="cozy"
        resolvingId={null}
        selectionMode="multiple"
        isSelected={() => false}
        bulkSelectedIds={[]}
        onToggleBulkSelected={jest.fn()}
        onTileClick={jest.fn()}
        onShowMetadata={jest.fn()}
      />,
    );

    expect(html).toContain("Select cover.png for bulk actions");
  });
});
