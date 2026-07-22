import { shareableMediaUrl } from "./durability";

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
