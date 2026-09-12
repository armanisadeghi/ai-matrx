import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CloudImageThumbnail } from "@/components/image/cloud/CloudImageThumbnail";

jest.mock("@ai-matrx/media/react", () => ({
  MediaThumbnail: ({ mediaRef }: { mediaRef: { file_id?: string } }) => (
    <div data-file-id={mediaRef.file_id ?? ""} />
  ),
}));

describe("CloudImageThumbnail", () => {
  it("resolves through durable file identity without a stored URL bypass", () => {
    const html = renderToStaticMarkup(
      <CloudImageThumbnail
        file={{
          id: "image-1",
          fileName: "cover.png",
          mimeType: "image/png",
          fileSize: 1024,
        }}
        iconSize={48}
      />,
    );

    expect(html).toContain('data-file-id="image-1"');
  });
});
