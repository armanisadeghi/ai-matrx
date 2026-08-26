/**
 * Regression lock: a historical chat message holding an EXPIRED signed S3 URL
 * must still yield a durable identity, so the render path can re-mint from the
 * file_id instead of showing a broken image.
 *
 * The URLs below are the real strings stored in chat.message content for
 * conversations 5e7a6f5b… and 33d3230d… (signature truncated — the recogniser
 * never validates the signature, only the shape).
 */
import { recognizeOurFileUrl } from "@/lib/media/our-file-sources";

const OWNER = "4cf62e4e-2679-484f-b652-034e697418df";
const FILE_ID = "6feae31a-945b-4dcc-8fc0-2041bb76c6b1";

const EXPIRED_SIGNED_URL =
  `https://matrx-user-files.s3.amazonaws.com/${OWNER}/${FILE_ID}` +
  `?response-content-disposition=inline%3B%20filename%3D%22infographic.png%22` +
  `&response-content-type=image%2Fpng&AWSAccessKeyId=AKIAEXAMPLE` +
  `&Signature=deadbeef%3D&Expires=1786485620`;

describe("recognizeOurFileUrl — legacy signed S3 URLs", () => {
  it("recovers the file_id from an expired signed URL", () => {
    const match = recognizeOurFileUrl(EXPIRED_SIGNED_URL);
    expect(match).not.toBeNull();
    expect(match!.fileId).toBe(FILE_ID);
  });

  it("hands back an identity-based FileSource, not the dead URL", () => {
    const match = recognizeOurFileUrl(EXPIRED_SIGNED_URL);
    // Identity beats the opaque string: the handler can re-mint from a
    // file_id forever, but never from an expiring URL.
    expect(match!.source).toEqual(
      expect.objectContaining({ kind: "file_id", fileId: FILE_ID }),
    );
  });

  it("marks the stored URL as NOT durable", () => {
    expect(recognizeOurFileUrl(EXPIRED_SIGNED_URL)!.durableUrl).toBe(false);
  });

  it("does not claim a genuinely external image", () => {
    expect(
      recognizeOurFileUrl("https://images.example.com/photo.png"),
    ).toBeNull();
  });
});
