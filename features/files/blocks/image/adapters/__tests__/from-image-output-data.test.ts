import { fromImageOutputData } from "../from-image-output-data";

const FILE_ID = "a2458139-793b-4c55-b067-a488a5ca11ea";
const INLINE = `https://server.app.matrxserver.com/files/${FILE_ID}/download?inline=1`;

describe("fromImageOutputData visibility", () => {
  it("never guesses public when the server said nothing", () => {
    // The 2026-09-16 block: file_id + durable inline url, metadata without
    // visibility (cost/model/usage only). Guessing "public" filed the
    // authenticated endpoint as a permanent CDN URL and put a personal
    // image on the third-party-cookie lane.
    const block = fromImageOutputData(
      { file_id: FILE_ID, url: INLINE, mime_type: "image/png" } as never,
      { cost: 0.015, model: "gpt-image-2", provider: "openai" },
    );
    expect(block.origin).toBe("matrx");
    expect(block).toMatchObject({ fileId: FILE_ID, visibility: "personal" });
  });

  it("reads the visibility the server now stamps", () => {
    const block = fromImageOutputData(
      { file_id: FILE_ID, url: "https://cdn.matrxserver.com/u/x.png", mime_type: "image/png" } as never,
      { visibility: "public", cdn_url: "https://cdn.matrxserver.com/u/x.png" },
    );
    expect(block).toMatchObject({ visibility: "public" });
  });
});
