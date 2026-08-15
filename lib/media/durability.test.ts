import { classifyMediaUrl, shareableMediaUrl } from "./durability";

describe("shareableMediaUrl", () => {
  it("rejects AWS SigV2 bearer URLs", () => {
    expect(
      shareableMediaUrl(
        "https://matrx-user-files.s3.amazonaws.com/user/file?AWSAccessKeyId=AKIAEXAMPLE&Signature=secret&Expires=1784686676",
      ),
    ).toBeNull();
  });

  it("rejects AWS SigV4 bearer URLs", () => {
    expect(
      shareableMediaUrl(
        "https://example.s3.amazonaws.com/file?X-Amz-Credential=test&X-Amz-Signature=secret&X-Amz-Expires=3600",
      ),
    ).toBeNull();
  });

  it("allows durable public and Matrx share URLs", () => {
    expect(shareableMediaUrl("https://cdn.example.com/video.mp4")).toBe(
      "https://cdn.example.com/video.mp4",
    );
    expect(
      shareableMediaUrl("https://server.app.matrxserver.com/share/token"),
    ).toBe("https://server.app.matrxserver.com/share/token");
  });
});

describe("revocable share links are not durable (D108)", () => {
  it("classifies a share download link as expiring", () => {
    expect(
      classifyMediaUrl(
        "https://server.app.matrxserver.com/share/750be40a-d6af-41f7-b749-fe47f01a8417/download",
      ),
    ).toBe("expiring");
  });

  it("keeps a CDN url durable, with or without a cache-buster", () => {
    expect(
      classifyMediaUrl("https://cdn.matrxserver.com/u/Shared%20Assets/x.png"),
    ).toBe("durable");
    expect(classifyMediaUrl("https://cdn.matrxserver.com/u/x.png?v=abc123")).toBe(
      "durable",
    );
  });

  it("does not mistake an unrelated /share/ page path for a media link", () => {
    expect(classifyMediaUrl("https://aimatrx.com/share/my-article")).toBe(
      "durable",
    );
  });
});
