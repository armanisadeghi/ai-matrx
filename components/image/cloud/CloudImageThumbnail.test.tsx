import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CloudImageThumbnail } from "@/components/image/cloud/CloudImageThumbnail";

jest.mock("@ai-matrx/media/react", () => ({
  MediaThumbnail: ({ thumbnailUrl }: { thumbnailUrl?: string | null }) => (
    <div data-thumbnail-url={thumbnailUrl ?? ""} />
  ),
}));

describe("CloudImageThumbnail", () => {
  it("passes the durable backend thumbnail to the shared media renderer", () => {
    const html = renderToStaticMarkup(
      <CloudImageThumbnail
        file={{
          id: "image-1",
          fileName: "cover.png",
          mimeType: "image/png",
          fileSize: 1024,
          thumbnailUrl: "https://cdn.example/cover-thumb.webp",
        }}
        iconSize={48}
      />,
    );

    expect(html).toContain(
      'data-thumbnail-url="https://cdn.example/cover-thumb.webp"',
    );
  });
});
