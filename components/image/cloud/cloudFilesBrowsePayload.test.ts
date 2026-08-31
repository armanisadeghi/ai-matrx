import { buildCloudFilesBrowsePayload } from "@/components/image/cloud/cloudFilesBrowsePayload";

describe("buildCloudFilesBrowsePayload", () => {
  it("passes plain URL strings to the image viewer payload", async () => {
    const payload = await buildCloudFilesBrowsePayload({
      imageRows: [
        { id: "cover", fileName: "cover.jpg" },
        { id: "thumb", fileName: "thumb.jpg" },
      ],
      activeFileId: "thumb",
      resolveUrl: async (fileId) => `https://cdn.example.com/${fileId}.jpg`,
    });

    expect(payload).toEqual({
      images: [
        "https://cdn.example.com/cover.jpg",
        "https://cdn.example.com/thumb.jpg",
      ],
      alts: ["cover.jpg", "thumb.jpg"],
      initialIndex: 1,
    });
  });

  it("returns an empty payload when the active image fails to resolve", async () => {
    const payload = await buildCloudFilesBrowsePayload({
      imageRows: [
        { id: "cover", fileName: "cover.jpg" },
        { id: "thumb", fileName: "thumb.jpg" },
      ],
      activeFileId: "thumb",
      resolveUrl: async (fileId) => {
        if (fileId === "thumb") {
          throw new Error("durable URL failed");
        }
        return `https://cdn.example.com/${fileId}.jpg`;
      },
    });

    expect(payload).toEqual({
      images: [],
      alts: [],
      initialIndex: 0,
    });
  });
});
