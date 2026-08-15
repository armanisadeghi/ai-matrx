import {
  DROPPED_SIGNED_URL,
  DROPPED_STORAGE_PATH,
  agentFileRef,
  mediaSafe,
} from "./agent-payload";

const SIGV2 =
  "https://matrx-user-files.s3.amazonaws.com/user/file?AWSAccessKeyId=AKIAEXAMPLE&Signature=secret&Expires=1784686676";
const SIGV4 =
  "https://example.s3.amazonaws.com/file?X-Amz-Credential=test&X-Amz-Signature=secret&X-Amz-Expires=3600";
const CDN = "https://cdn.aimatrx.com/files/abc.png?v=deadbeef";

describe("mediaSafe", () => {
  it("drops signed URLs in both AWS dialects", () => {
    expect(mediaSafe({ a: SIGV2, b: SIGV4 })).toEqual({
      a: DROPPED_SIGNED_URL,
      b: DROPPED_SIGNED_URL,
    });
  });

  it("keeps durable CDN URLs", () => {
    expect(mediaSafe({ cdnUrl: CDN })).toEqual({ cdnUrl: CDN });
  });

  it("drops raw storage paths by key, in every casing", () => {
    expect(
      mediaSafe({ filePath: "u/1/f.png", storage_uri: "s3://b/k" }),
    ).toEqual({
      filePath: DROPPED_STORAGE_PATH,
      storage_uri: DROPPED_STORAGE_PATH,
    });
  });

  it("sanitizes nested arrays and objects", () => {
    expect(mediaSafe({ rows: [{ signedUrl: SIGV4, name: "a" }] })).toEqual({
      rows: [{ signedUrl: DROPPED_SIGNED_URL, name: "a" }],
    });
  });

  it("never mutates the input row", () => {
    const row = { signedUrl: SIGV4 };
    mediaSafe(row);
    expect(row.signedUrl).toBe(SIGV4);
  });

  it("survives circular references instead of throwing", () => {
    const row: Record<string, unknown> = { name: "a" };
    row.self = row;
    expect(() => mediaSafe(row)).not.toThrow();
  });

  it("leaves non-URL scalars alone", () => {
    expect(mediaSafe({ n: 1, b: true, s: "hello", z: null })).toEqual({
      n: 1,
      b: true,
      s: "hello",
      z: null,
    });
  });
});

describe("agentFileRef", () => {
  it("emits file_id plus a durable URL when one exists", () => {
    expect(
      agentFileRef({ id: "f1", fileName: "a.png", cdnUrl: CDN }),
    ).toEqual({
      file_id: "f1",
      name: "a.png",
      mime_type: null,
      size_bytes: null,
      durable_url: CDN,
    });
  });

  it("returns durable_url null rather than a signed URL", () => {
    expect(
      agentFileRef({ id: "f1", cdnUrl: SIGV4, publicUrl: SIGV2 }).durable_url,
    ).toBeNull();
  });

  it("accepts snake_case rows", () => {
    expect(agentFileRef({ file_id: "f2", file_name: "b.png" }).file_id).toBe(
      "f2",
    );
  });
});
