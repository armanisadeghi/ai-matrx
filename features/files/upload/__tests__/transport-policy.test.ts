/**
 * Transport-policy + TUS-client unit tests:
 * - buffered vs TUS routing at the 80 MB threshold, with explicit overrides;
 * - buffered ↔ TUS metadata_json parity (ONE shared envelope builder);
 * - abort via AbortSignal;
 * - full TUS wire against an injected HttpStack (creation POST with
 *   X-Idempotency-Key + fresh auth per request, chunked PATCH, X-Cld-File-Id
 *   capture, file-record resolution).
 *
 * Live E2E against the deployed server is PENDING (server changes exist in
 * aidream locally, not deployed) — see features/files/handler/FEATURE.md.
 */

import {
  resolveUploadTransport,
  TUS_TRANSPORT_THRESHOLD_BYTES,
} from "@/features/files/upload/cloudUpload";
import {
  buildUploadMetadataEnvelope,
  tusUploadRaw,
  TUS_CHUNK_SIZE_BYTES,
} from "@/features/files/upload/tusUpload";
import * as Files from "@/features/files/api/files";
import type { HttpStack, HttpRequest, HttpResponse } from "tus-js-client";

jest.mock("@/lib/python-client", () => ({
  buildHeaders: jest.fn(async () => ({
    headers: {
      Authorization: "Bearer fresh-token",
      "X-Guest-Fingerprint": "fp-1",
    },
    requestId: "req-1",
  })),
  resolveBaseUrlForPath: jest.fn(() => "https://api.test"),
}));

jest.mock("@/features/files/api/files", () => ({
  getFile: jest.fn(),
}));

const mockedGetFile = Files.getFile as jest.MockedFunction<typeof Files.getFile>;

// ─── Policy ──────────────────────────────────────────────────────────────────

describe("resolveUploadTransport", () => {
  test("routes by the 80 MB threshold", () => {
    expect(TUS_TRANSPORT_THRESHOLD_BYTES).toBe(80 * 1024 * 1024);
    expect(resolveUploadTransport(TUS_TRANSPORT_THRESHOLD_BYTES - 1)).toBe(
      "buffered",
    );
    expect(resolveUploadTransport(TUS_TRANSPORT_THRESHOLD_BYTES)).toBe("tus");
    expect(resolveUploadTransport(TUS_TRANSPORT_THRESHOLD_BYTES + 1)).toBe(
      "tus",
    );
  });

  test("explicit override wins in both directions", () => {
    expect(resolveUploadTransport(1, "tus")).toBe("tus");
    expect(
      resolveUploadTransport(TUS_TRANSPORT_THRESHOLD_BYTES * 2, "buffered"),
    ).toBe("buffered");
  });
});

// ─── metadata_json parity ────────────────────────────────────────────────────

describe("metadata_json parity (buffered ↔ TUS)", () => {
  test("both transports serialize the SAME envelope object", () => {
    const metadata = {
      capture: { version: 1, artifact_kind: "video" },
      scope: { organization_id: "org-1" },
    };
    // Buffered path: cloudUpload passes buildUploadMetadataEnvelope(metadata)
    // into the `metadata_json` form field (JSON.stringify in api/files.ts).
    const buffered = JSON.stringify(buildUploadMetadataEnvelope(metadata));
    // TUS path: tusUpload puts JSON.stringify(buildUploadMetadataEnvelope(...))
    // into Upload-Metadata's metadata_json key (base64 by tus-js-client).
    const tusSide = JSON.stringify(buildUploadMetadataEnvelope(metadata));
    expect(tusSide).toBe(buffered);
    expect(JSON.parse(buffered)).toEqual({ origin: "cloudUpload", ...metadata });
  });

  test("caller metadata can override the origin tag, identically on both sides", () => {
    const metadata = { origin: "customOrigin" };
    expect(buildUploadMetadataEnvelope(metadata)).toEqual({
      origin: "customOrigin",
    });
  });
});

// ─── Fake TUS wire ───────────────────────────────────────────────────────────

interface WireCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  bodySize: number | null;
}

function makeResponse(
  status: number,
  headers: Record<string, string>,
): HttpResponse {
  return {
    getStatus: () => status,
    getHeader: (h: string) => headers[h] ?? headers[h.toLowerCase()],
    getBody: () => "",
    getUnderlyingObject: () => null,
  };
}

/** Minimal in-memory TUS server: creation POST → Location; PATCH accepts
 *  chunks and returns X-Cld-File-Id on the final one. */
function makeFakeStack(fileSize: number, fileId: string) {
  const calls: WireCall[] = [];
  let offset = 0;
  const stack: HttpStack = {
    getName: () => "FakeStack",
    createRequest(method: string, url: string): HttpRequest {
      const headers: Record<string, string> = {};
      return {
        getMethod: () => method,
        getURL: () => url,
        setHeader: (h: string, v: string) => {
          headers[h] = v;
        },
        getHeader: (h: string) => headers[h],
        setProgressHandler: () => undefined,
        abort: async () => undefined,
        getUnderlyingObject: () => null,
        async send(body?: unknown): Promise<HttpResponse> {
          const bodySize =
            body instanceof Blob
              ? body.size
              : body && typeof body === "object" && "byteLength" in body
                ? (body as ArrayBufferView).byteLength
                : null;
          calls.push({ method, url, headers: { ...headers }, bodySize });
          if (method === "POST") {
            return makeResponse(201, {
              Location: "https://api.test/files/upload/tus/session-1",
              "Tus-Resumable": "1.0.0",
            });
          }
          if (method === "HEAD") {
            return makeResponse(200, {
              "Upload-Offset": String(offset),
              "Upload-Length": String(fileSize),
              "Tus-Resumable": "1.0.0",
            });
          }
          if (method === "PATCH") {
            offset += bodySize ?? 0;
            const done = offset >= fileSize;
            return makeResponse(204, {
              "Upload-Offset": String(offset),
              "Tus-Resumable": "1.0.0",
              ...(done ? { "X-Cld-File-Id": fileId } : {}),
            });
          }
          return makeResponse(404, {});
        },
      };
    },
  };
  return { stack, calls };
}

interface StoredPrev {
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
  urlStorageKey: string;
}

function memoryUrlStorage() {
  const uploads = new Map<string, StoredPrev>();
  return {
    findAllUploads: async (): Promise<StoredPrev[]> => [...uploads.values()],
    findUploadsByFingerprint: async (fp: string): Promise<StoredPrev[]> =>
      [...uploads.entries()]
        .filter(([k]) => k.startsWith(fp))
        .map(([, v]) => v),
    removeUpload: async (key: string): Promise<void> => {
      uploads.delete(key);
    },
    addUpload: async (fp: string, upload: StoredPrev): Promise<string> => {
      const key = `${fp}::${uploads.size}`;
      uploads.set(key, { ...upload, urlStorageKey: key });
      return key;
    },
  };
}

/** Blob-backed file reader — Jest resolves tus-js-client's Node build, whose
 *  default reader only accepts Buffer/Readable. */
const blobFileReader = {
  async openFile(input: Blob, _chunkSize: number) {
    return {
      size: input.size,
      slice: async (start: number, end: number) => ({
        value: input.slice(start, end),
        done: end >= input.size,
      }),
      close: () => undefined,
    };
  },
};

describe("tusUploadRaw (injected HttpStack)", () => {
  test("uploads with fresh auth per request, idempotency key on creation only, resolves via X-Cld-File-Id", async () => {
    const file = new File([new Uint8Array(1024)], "big.webm", {
      type: "video/webm",
    });
    const { stack, calls } = makeFakeStack(file.size, "file-123");
    mockedGetFile.mockResolvedValue({
      data: {
        id: "file-123",
        file_path: "Captures/Videos/big.webm",
        size_bytes: 1024,
        current_version: 1,
      } as never,
      meta: { requestId: "r", status: 200, serverRequestId: null },
    });

    const result = await tusUploadRaw(
      file,
      "Captures/Videos/big.webm",
      { metadata: { capture: { note: "x" } } },
      "idem-key-1",
      {
        httpStack: stack,
        fileReader: blobFileReader as never,
        urlStorage: memoryUrlStorage() as never,
      },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileId).toBe("file-123");
      expect(result.filePath).toBe("Captures/Videos/big.webm");
      expect(result.versionNumber).toBe(1);
    }

    const post = calls.find((c) => c.method === "POST");
    expect(post).toBeDefined();
    expect(post!.url).toBe("https://api.test/files/upload/tus");
    expect(post!.headers["X-Idempotency-Key"]).toBe("idem-key-1");
    expect(post!.headers.Authorization).toBe("Bearer fresh-token");
    // Upload-Metadata carries the base64 metadata_json envelope.
    expect(post!.headers["Upload-Metadata"]).toContain("metadata_json ");

    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.length).toBeGreaterThan(0);
    for (const patch of patches) {
      // Fresh auth on EVERY request, idempotency key ONLY on creation.
      expect(patch.headers.Authorization).toBe("Bearer fresh-token");
      expect(patch.headers["X-Idempotency-Key"]).toBeUndefined();
    }
    expect(TUS_CHUNK_SIZE_BYTES).toBe(16 * 1024 * 1024);
  });

  test("missing X-Cld-File-Id is a loud failure, never a silent success", async () => {
    const file = new File([new Uint8Array(16)], "x.webm", {
      type: "video/webm",
    });
    const { stack } = makeFakeStack(file.size, "");
    const result = await tusUploadRaw(file, "x.webm", {}, "idem", {
      httpStack: stack,
      fileReader: blobFileReader as never,
      urlStorage: memoryUrlStorage() as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("tus_missing_file_id");
    }
  });

  test("pre-aborted AbortSignal cancels before any network activity", async () => {
    const file = new File([new Uint8Array(16)], "x.webm", {
      type: "video/webm",
    });
    const { stack, calls } = makeFakeStack(file.size, "file-1");
    const controller = new AbortController();
    controller.abort();
    const result = await tusUploadRaw(
      file,
      "x.webm",
      { signal: controller.signal },
      "idem",
      {
        httpStack: stack,
        fileReader: blobFileReader as never,
        urlStorage: memoryUrlStorage() as never,
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("upload_cancelled");
    }
    expect(calls).toHaveLength(0);
  });
});
