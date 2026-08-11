/**
 * Pins THE RULE that a tool result must never leak where we store bytes.
 *
 * A user asked for an image and got the string "matrx-user-files.s3.amazonaws.com"
 * in a link chip — our storage provider rendered in place of their image, on a URL
 * that dies the moment its signature expires. `detectResultShape` is the single
 * truth-teller every tool result renders through, so the rule lives here: OUR file
 * URLs resolve to a durable identity and the canonical component, never a link.
 *
 * Third-party URLs must keep their UrlChip — that IS the useful rendering.
 */

import { detectResultShape, coerceMediaRef } from "../shape";

const USER_ID = "4cf62e4e-2679-484f-b652-034e697418df";
const FILE_ID = "6feae31a-945b-4dcc-8fc0-2041bb76c6b1";

/** The exact URL shape our image backend mints (SigV2, no path extension). */
const SIGNED_IMAGE_URL =
  `https://matrx-user-files.s3.amazonaws.com/${USER_ID}/${FILE_ID}` +
  `?response-content-disposition=inline%3B%20filename%3D%22tiktok-algorithm.png%22` +
  `&response-content-type=image%2Fpng` +
  `&AWSAccessKeyId=AKIA4WJPWQC7PVFDDC42&Signature=RpqmXw%2Fg0Se8uAR3SMVcp9gg7MY%3D` +
  `&Expires=1786485620`;

const SIGNED_PDF_URL =
  `https://matrx-user-files.s3.amazonaws.com/${USER_ID}/${FILE_ID}` +
  `?response-content-disposition=inline%3B%20filename%3D%22quarterly-report.pdf%22` +
  `&response-content-type=application%2Fpdf` +
  `&AWSAccessKeyId=AKIA4WJPWQC7PVFDDC42&Signature=abc%3D&Expires=1786485620`;

describe("our own file URLs never render as a link", () => {
  test("a bare signed image URL becomes media keyed by file_id", () => {
    const shape = detectResultShape(SIGNED_IMAGE_URL);
    expect(shape.kind).toBe("media");
    if (shape.kind !== "media") return;
    expect(shape.ref.file_id).toBe(FILE_ID);
    expect(shape.ref.mime_type).toBe("image/png");
    // The expiring URL must NOT be carried — file_id is what re-mints.
    expect(shape.ref.url).toBeUndefined();
  });

  test("the agent_call image payload renders the image, not an S3 host", () => {
    // The literal result aidream returns from agent_call (agent_call.py).
    const shape = detectResultShape({
      agent_id: "bcc69216-d4fa-4e28-a090-8a7749123bc5",
      agent_name: "Matrx Image Ultra",
      result: SIGNED_IMAGE_URL,
      model_id: "0386fcae-1cf5-4d31-9a05-3b8ba61b2f3a",
    });
    // The envelope is still an object (agent name / ids stay visible)…
    expect(shape.kind).toBe("object");
    // …but the `result` field itself now resolves to the canonical component.
    if (shape.kind !== "object") return;
    const inner = detectResultShape(shape.value.result);
    expect(inner.kind).toBe("media");
    if (inner.kind !== "media") return;
    expect(inner.ref.file_id).toBe(FILE_ID);
  });

  test("a signed NON-media URL becomes a file card, still never a link", () => {
    const shape = detectResultShape(SIGNED_PDF_URL);
    expect(shape.kind).toBe("file");
    if (shape.kind !== "file") return;
    expect(shape.file.file_id).toBe(FILE_ID);
    expect(shape.file.mime_type).toBe("application/pdf");
    expect(shape.file.file_name).toBe("quarterly-report.pdf");
    // A signed URL is never carried on the card — it would be a dead link.
    expect(shape.file.url).toBeUndefined();
  });

  test("an object with our URL under a media key resolves by file_id", () => {
    const ref = coerceMediaRef({ url: SIGNED_IMAGE_URL });
    expect(ref?.file_id).toBe(FILE_ID);
  });

  test("the canonical server media_ref envelope is unwrapped", () => {
    const shape = detectResultShape({
      kind: "image_ref",
      media_ref: { file_id: FILE_ID, mime_type: "image/png" },
      source_width: 1024,
      source_height: 1024,
    });
    expect(shape.kind).toBe("media");
    if (shape.kind !== "media") return;
    expect(shape.ref.file_id).toBe(FILE_ID);
  });
});

describe("URLs that are NOT ours keep their link rendering", () => {
  test("a third-party page URL stays a url", () => {
    expect(detectResultShape("https://www.socialynk.com/tiktok-algorithm").kind).toBe("url");
  });

  test("a third-party image URL stays media-by-url (unchanged behavior)", () => {
    const shape = detectResultShape("https://example.com/photo.png");
    expect(shape.kind).toBe("media");
    if (shape.kind !== "media") return;
    expect(shape.ref.url).toBe("https://example.com/photo.png");
    expect(shape.ref.file_id).toBeUndefined();
  });

  test("a conversation share link is NOT mistaken for a file", () => {
    // `/share/<token>` with no recoverable file identity and no type is just as
    // likely a shared conversation — it must keep its UrlChip.
    expect(detectResultShape("https://www.aimatrx.com/share/abc123XYZ").kind).toBe("url");
  });

  test("a plain string is still a scalar", () => {
    expect(detectResultShape("Image generated successfully.").kind).toBe("scalar");
  });
});
