/**
 * THE IMAGE TILE TAKES AN IMAGE LINK.
 *
 * Verify-3 (2026-09-29): the Source input's Upload, Recording and Image tiles
 * opened the identical file panel — the Image tile had no way to take an image
 * LINK. `imageLinkToFile` is the one turn from a link to a File the canonical
 * upload pipeline takes; a site that will not share its bytes gets the remedy.
 */

import { ImageLinkError, imageLinkToFile } from "../imageLink";

const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

describe("imageLinkToFile", () => {
  it("fetches an image link into a named image File", async () => {
    const fetchImpl = jest.fn(async () => new Response(png(), { status: 200, headers: { "content-type": "image/png" } }));
    const file = await imageLinkToFile("cdn.example.com/pics/cell-diagram.png", fetchImpl as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith("https://cdn.example.com/pics/cell-diagram.png");
    expect(file.name).toBe("cell-diagram.png");
    expect(file.type).toBe("image/png");
  });

  it("refuses a web page link without fetching it", async () => {
    const fetchImpl = jest.fn();
    await expect(imageLinkToFile("https://example.com/article", fetchImpl as typeof fetch)).rejects.toThrow(
      "That is a web page, not an image.",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("names the remedy when the site will not share the image", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await imageLinkToFile("https://example.com/a.jpg", fetchImpl as typeof fetch).catch((e) => e);
    expect(err).toBeInstanceOf(ImageLinkError);
    expect(err.message).toMatch(/Save the image, then upload it/);
  });
});
