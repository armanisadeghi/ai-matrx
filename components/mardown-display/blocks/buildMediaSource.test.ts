import { buildMediaSource } from "./buildMediaSource";

describe("buildMediaSource", () => {
  it("recovers a Matrx file id from a signed video URL before rendering", () => {
    expect(
      buildMediaSource(
        {
          url: "https://matrx-user-files.s3.amazonaws.com/4cf62e4e-2679-484f-b652-034e697418df/f6c23f8e-8a0f-45c5-9d9b-461c28f77d02?AWSAccessKeyId=AKIAEXAMPLE&Signature=secret&Expires=1784686676",
        },
        "video/mp4",
      ),
    ).toEqual({
      kind: "file_id",
      fileId: "f6c23f8e-8a0f-45c5-9d9b-461c28f77d02",
      mime: "video/mp4",
    });
  });
});
