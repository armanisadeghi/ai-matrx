/**
 * features/files/upload/tusUpload.ts
 *
 * Resumable (TUS) upload transport for the file handler — the large-file
 * sibling of the buffered multipart path in `cloudUpload.ts`. Callers never
 * import this directly: `cloudUpload` routes here per the transport policy
 * (size ≥ `TUS_TRANSPORT_THRESHOLD_BYTES`, or an explicit
 * `transport: "tus"` override).
 *
 * Wire contract (common-docs/media-capture/FEATURE.md § TUS):
 * - Endpoint: `${PYTHON_BACKEND}/files/upload/tus` (resolved through the same
 *   base-url helper the python-client uses — server toggle respected).
 * - Explicit chunk size 16 MiB (server bounds 8–32 MiB; never the client
 *   default).
 * - `Upload-Metadata` carries `filename`, `filepath`, and ONE `metadata_json`
 *   key — the base64 of the SAME JSON object the buffered path sends as its
 *   `metadata_json` form field (tus-js-client base64-encodes values; the
 *   object is built by the shared `buildUploadMetadataEnvelope`). Parity with
 *   buffered uploads is a tested invariant.
 * - FRESH Authorization per request (`onBeforeRequest` re-reads the Supabase
 *   session — long uploads outlive a single JWT).
 * - `X-Idempotency-Key` on the creation POST only.
 * - Final `X-Cld-File-Id` captured from response headers (final PATCH, or the
 *   completed-session HEAD/POST recovery paths) — a lost final response never
 *   forces a re-upload.
 * - Resume URLs live in a dedicated tiny IndexedDB (`mtx-tus-urls`) — NEVER
 *   the recorder chunk journal DB.
 *
 * NOT LIVE-TESTED against production: the server side (CORS, metadata parity,
 * completed-HEAD recovery) exists in aidream locally but is not deployed —
 * see features/files/handler/FEATURE.md § Transport policy for the pending
 * E2E note. The client is unit-tested with an injected HttpStack.
 */

import * as tus from "tus-js-client";
import { buildHeaders, resolveBaseUrlForPath } from "@/lib/python-client";
// eslint-disable-next-line no-restricted-imports -- transport sibling INSIDE the ring-fenced upload internals (same as cloudUpload.ts's own internal imports)
import * as Files from "@/features/files/api/files";
import { extractErrorMessage } from "@/utils/errors";
// eslint-disable-next-line no-restricted-imports -- type-only import between the two upload transports (both internal to features/files/upload)
import type {
  CloudUploadOptions,
  CloudUploadResult,
} from "@/features/files/upload/cloudUpload";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Server-bounded chunk size (8–32 MiB allowed): 16 MiB. */
export const TUS_CHUNK_SIZE_BYTES = 16 * 1024 * 1024;

export const TUS_UPLOAD_PATH = "/files/upload/tus";

// ─── Shared metadata envelope (buffered ↔ TUS parity) ────────────────────────

/**
 * The ONE builder for the upload metadata JSON object. The buffered path
 * serializes this into the `metadata_json` form field
 * (`features/files/api/files.ts`); the TUS path serializes the SAME object
 * into the `metadata_json` Upload-Metadata key. One builder ⇒ the two
 * transports can never drift (parity is unit-tested).
 */
export function buildUploadMetadataEnvelope(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    // Origin tag aids backend log triage when something goes wrong.
    origin: "cloudUpload",
    ...(metadata ?? {}),
  };
}

// ─── Dedicated resume-URL storage (mtx-tus-urls) ─────────────────────────────

const URL_DB_NAME = "mtx-tus-urls";
const URL_STORE = "urls";

interface StoredTusUpload {
  urlStorageKey: string;
  fingerprint: string;
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  uploadUrl: string | null;
  parallelUploadUrls: string[] | null;
}

let urlDbPromise: Promise<IDBDatabase> | null = null;

function openUrlDb(): Promise<IDBDatabase> {
  if (urlDbPromise) return urlDbPromise;
  urlDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("[tusUpload] IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(URL_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(URL_STORE)) {
        const store = db.createObjectStore(URL_STORE, {
          keyPath: "urlStorageKey",
        });
        store.createIndex("fingerprint", "fingerprint", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("[tusUpload] failed to open mtx-tus-urls"));
  });
  urlDbPromise.catch(() => {
    urlDbPromise = null;
  });
  return urlDbPromise;
}

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB failed"));
  });
}

type PreviousUpload = Awaited<
  ReturnType<tus.Upload["findPreviousUploads"]>
>[number];

/** tus-js-client UrlStorage backed by the dedicated `mtx-tus-urls` DB —
 *  deliberately SEPARATE from the recorder chunk journal. */
export function createTusUrlStorage(): NonNullable<
  ConstructorParameters<typeof tus.Upload>[1]["urlStorage"]
> {
  return {
    async findAllUploads(): Promise<PreviousUpload[]> {
      const db = await openUrlDb();
      const tx = db.transaction(URL_STORE, "readonly");
      const all = await idbRequest(
        tx.objectStore(URL_STORE).getAll() as IDBRequest<StoredTusUpload[]>,
      );
      return all;
    },
    async findUploadsByFingerprint(
      fingerprint: string,
    ): Promise<PreviousUpload[]> {
      const db = await openUrlDb();
      const tx = db.transaction(URL_STORE, "readonly");
      const matches = await idbRequest(
        tx
          .objectStore(URL_STORE)
          .index("fingerprint")
          .getAll(fingerprint) as IDBRequest<StoredTusUpload[]>,
      );
      return matches;
    },
    async removeUpload(urlStorageKey: string): Promise<void> {
      const db = await openUrlDb();
      const tx = db.transaction(URL_STORE, "readwrite");
      tx.objectStore(URL_STORE).delete(urlStorageKey);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
      });
    },
    async addUpload(
      fingerprint: string,
      upload: PreviousUpload,
    ): Promise<string> {
      const urlStorageKey = `tus::${fingerprint}::${Date.now().toString(36)}`;
      const record: StoredTusUpload = {
        urlStorageKey,
        fingerprint,
        size: upload.size,
        metadata: upload.metadata,
        creationTime: upload.creationTime,
        uploadUrl: upload.uploadUrl,
        parallelUploadUrls: upload.parallelUploadUrls,
      };
      const db = await openUrlDb();
      const tx = db.transaction(URL_STORE, "readwrite");
      tx.objectStore(URL_STORE).put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("IndexedDB tx failed"));
      });
      return urlStorageKey;
    },
  };
}

/** Read-only summary of a stored TUS resume session (diagnostics surfaces —
 *  /camera's resume-pending indicator, /camera/admin). */
export interface StoredTusUploadSummary {
  urlStorageKey: string;
  fingerprint: string;
  size: number | null;
  metadata: Record<string, string>;
  creationTime: string;
  uploadUrl: string | null;
}

/**
 * List every stored TUS resume-URL entry (the `mtx-tus-urls` DB). Read-only —
 * resuming still happens inside `tusUploadRaw` via the UrlStorage; this only
 * lets management surfaces SHOW that a resumable session is pending. Returns
 * [] where IndexedDB is unavailable (never throws — diagnostics must not
 * break a page).
 */
export async function listStoredTusUploads(): Promise<
  StoredTusUploadSummary[]
> {
  try {
    const db = await openUrlDb();
    const tx = db.transaction(URL_STORE, "readonly");
    const all = await idbRequest(
      tx.objectStore(URL_STORE).getAll() as IDBRequest<StoredTusUpload[]>,
    );
    return all.map((r) => ({
      urlStorageKey: r.urlStorageKey,
      fingerprint: r.fingerprint,
      size: r.size,
      metadata: r.metadata,
      creationTime: r.creationTime,
      uploadUrl: r.uploadUrl,
    }));
  } catch (err) {
    console.error("[tusUpload] listStoredTusUploads failed:", err);
    return [];
  }
}

// ─── The transport ───────────────────────────────────────────────────────────

export interface TusUploadDeps {
  /** Injected HttpStack for unit tests (mock wire, no XHR). */
  httpStack?: tus.HttpStack;
  /** Injected file reader for unit tests (Node builds of tus-js-client
   *  cannot slice browser Files). */
  fileReader?: ConstructorParameters<typeof tus.Upload>[1]["fileReader"];
  /** Override the endpoint (tests). */
  endpointOverride?: string;
  /** Override URL storage (tests). */
  urlStorage?: ReturnType<typeof createTusUrlStorage>;
}

/**
 * Resumable upload of one file via TUS. Same result contract as
 * `cloudUploadRaw` — `{ ok: true, fileId, ... } | { ok: false, error }`,
 * never throws. Automatically resumes a previous session for the same file
 * (custom UrlStorage + server HEAD), including the completed-session
 * recovery: when the server reports the session already finished and hands
 * back `X-Cld-File-Id`, the upload is skipped and the file resolves directly.
 */
export async function tusUploadRaw(
  file: File,
  filePath: string,
  options: CloudUploadOptions,
  idempotencyKey: string,
  deps: TusUploadDeps = {},
): Promise<CloudUploadResult> {
  const endpoint =
    deps.endpointOverride ??
    `${resolveBaseUrlForPath(TUS_UPLOAD_PATH, undefined, "POST")}${TUS_UPLOAD_PATH}`;

  const metadataEnvelope = buildUploadMetadataEnvelope(options.metadata);

  let cldFileId: string | null = null;
  let aborted = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const upload: tus.Upload = new tus.Upload(file, {
        endpoint,
        chunkSize: TUS_CHUNK_SIZE_BYTES,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        removeFingerprintOnSuccess: true,
        urlStorage: deps.urlStorage ?? createTusUrlStorage(),
        ...(deps.httpStack ? { httpStack: deps.httpStack } : {}),
        ...(deps.fileReader ? { fileReader: deps.fileReader } : {}),
        metadata: {
          filename: file.name,
          filepath: filePath,
          // ONE validated JSON envelope — tus-js-client base64-encodes the
          // value per the Upload-Metadata spec; the server parses and merges
          // it exactly like the buffered `metadata_json` form field.
          metadata_json: JSON.stringify(metadataEnvelope),
          ...(options.visibility ? { visibility: options.visibility } : {}),
        },
        onBeforeRequest: async (req) => {
          // FRESH auth on EVERY request — long uploads outlive a JWT.
          const { headers } = await buildHeaders({}, false);
          if (headers.Authorization) {
            req.setHeader("Authorization", headers.Authorization);
          }
          if (headers["X-Guest-Fingerprint"]) {
            req.setHeader("X-Guest-Fingerprint", headers["X-Guest-Fingerprint"]);
          }
          if (req.getMethod() === "POST") {
            // Creation only — one intended upload, one key.
            req.setHeader("X-Idempotency-Key", idempotencyKey);
          }
        },
        onAfterResponse: (_req, res) => {
          // The final PATCH (and the completed-session HEAD recovery) carry
          // the created file id. Capture it whenever it appears.
          const id = res.getHeader("X-Cld-File-Id");
          if (id) cldFileId = id;
        },
        onProgress: (bytesSent, bytesTotal) => {
          options.onProgress?.({ loaded: bytesSent, total: bytesTotal });
        },
        onSuccess: () => resolve(),
        onError: (error) => reject(error),
      });

      if (options.signal) {
        if (options.signal.aborted) {
          aborted = true;
          reject(new Error("Upload cancelled"));
          return;
        }
        options.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            void upload.abort();
            reject(new Error("Upload cancelled"));
          },
          { once: true },
        );
      }

      // Resume automatically when a previous session for this file exists —
      // tus-js-client HEADs the stored URL; a completed session resolves via
      // the X-Cld-File-Id captured in onAfterResponse.
      void upload
        .findPreviousUploads()
        .then((previous) => {
          if (previous.length > 0) {
            upload.resumeFromPreviousUpload(previous[0]);
          }
          upload.start();
        })
        .catch((err) => {
          console.warn(
            "[tusUpload] previous-upload lookup failed — starting fresh:",
            err,
          );
          upload.start();
        });
    });
  } catch (err) {
    if (cldFileId && !aborted) {
      // Completed-session recovery: the transfer errored (e.g. a lost final
      // response surfaced as an error) but the server told us the file
      // exists. Resolve it instead of failing/re-uploading. LOUD by design.
      console.warn(
        `[tusUpload] transfer reported an error but the server exposed ` +
          `X-Cld-File-Id=${cldFileId} — recovering the completed session.`,
      );
    } else {
      return {
        ok: false,
        error: extractErrorMessage(err),
        errorCode: aborted ? "upload_cancelled" : "tus_upload_failed",
        fileName: file.name,
      };
    }
  }

  if (!cldFileId) {
    return {
      ok: false,
      error:
        "TUS upload finished but the server never exposed X-Cld-File-Id — " +
        "the file cannot be resolved. Check server CORS expose_headers.",
      errorCode: "tus_missing_file_id",
      fileName: file.name,
    };
  }

  // Hydrate the canonical row so the result matches the buffered contract.
  try {
    const { data: record } = await Files.getFile(cldFileId);
    return {
      ok: true,
      fileId: record.id,
      filePath: record.file_path,
      fileSize: record.size_bytes ?? file.size,
      versionNumber: record.current_version ?? 1,
      url: null,
    };
  } catch (err) {
    return {
      ok: false,
      error: `TUS upload completed (file ${cldFileId}) but the record fetch failed: ${extractErrorMessage(err)}`,
      errorCode: "tus_record_fetch_failed",
      fileName: file.name,
    };
  }
}
