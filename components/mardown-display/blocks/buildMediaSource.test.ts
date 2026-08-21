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

  it("prefers an explicit file_id over any URL on the block", () => {
    expect(
      buildMediaSource(
        {
          file_id: "11111111-2222-3333-4444-555555555555",
          url: "https://cdn.example.com/whatever.mp3",
        },
        "audio/mpeg",
      ),
    ).toEqual({
      kind: "file_id",
      fileId: "11111111-2222-3333-4444-555555555555",
      mime: "audio/mpeg",
    });
  });

  it("does NOT invent a file_id from a durable public URL that merely ends in a uuid", () => {
    // Pre-2026-05 audio rows are public-bucket URLs whose last segment is the
    // STORAGE object id, not a cld_files id. Minting from it produces a dead
    // player; the durable URL plays fine as-is.
    const url =
      "https://example.supabase.co/storage/v1/object/public/any-file/4cf62e4e-2679-484f-b652-034e697418df/becf5fda-bc01-4e1c-b676-8f011a1c7b40.wav";
    expect(buildMediaSource({ url }, "audio/wav")).toEqual({
      kind: "external_url",
      url,
      mime: "audio/wav",
    });
  });
});
