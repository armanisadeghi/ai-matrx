/**
 * features/files/media-client/client.ts
 *
 * THE construction site for the app's ONE file-communication client
 * (`@ai-matrx/data/files` — the C9 collapse of the former 436-line host
 * adapter). Every hard part lives in the package: durable-ref resolution and
 * the transport decision (byte-endpoint promotion included — QA F2), the
 * `mx_files_session` freshness tracker, blob in-flight dedup, the ONE retry
 * contract (`recoverLoadError`), the share-link door (permanent-CDN-or-
 * reuse-or-mint, fails closed), and the D108 expiring-URL refusal.
 *
 * Per C22 this module INJECTS identity values only — zero catch-and-
 * reinterpret, zero validation, zero retry logic:
 *
 *   - credentials        — the Redux token/fingerprint, read fresh per call;
 *   - the byte bases     — `resolveFilesBaseUrl` (+ the main base for the
 *                          session cookie, which is per-host);
 *   - metadata           — the Redux file store (`selectFileById` +
 *                          `ensureCloudFileFields`), so resolution and the
 *                          store never disagree;
 *   - blobCache          — the app's 3-tier byte cache (in-memory LRU + IDB);
 *   - largeUploadTransport — the fileHandler upload lane (today's real TUS
 *                          path for files at/over the 80 MB threshold);
 *   - uploadMany         — the host batch door (`requestUpload`: SHA-256
 *                          dedup pre-flight + folder-id targeting);
 *   - diagnostics        — the Error Inspector capture + console scream.
 *
 * This module is the SINGLETON decision: one instance, module-level, so the
 * session tracker and byte cache can never split across construction sites.
 */

import type { DurableSrc, MediaClient, MediaRef } from "@ai-matrx/media";
import type { CredentialsPort, MatrxCredential } from "@ai-matrx/data";
import {
  createMatrxFilesClient,
  type FileMetadata,
  type FileMetadataPort,
  type FilesDiagnosticsEvent,
  type MatrxFilesClient,
  type MediaMultiUploadResult,
  type MediaUploadOptions,
  type MediaUploadResult,
} from "@ai-matrx/data/files";
import { resolveBaseUrl, resolveFilesBaseUrl } from "@/lib/python-client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import {
  selectAccessToken,
  selectFingerprintId,
} from "@/lib/redux/slices/userSlice";
import {
  peekSelectedOrganizationId,
  waitForOrganizationAdmission,
} from "@/lib/api/organization-admission";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { fileHandler } from "@/features/files/handler/handler";
import type { CloudFile, Visibility } from "@/features/files/types";
import { selectFileById } from "@/features/files/redux/selectors";
import { ensureCloudFileFields } from "@/features/files/redux/thunks";
import {
  areCloudFileFieldsLoaded,
  FILE_RENDER_FIELDS,
} from "@/features/files/redux/file-hydration";
import {
  getCached,
  hydrateFromIdb,
  invalidate,
  setCached,
} from "@/features/files/hooks/blob-cache";
import { requestUpload } from "@/features/files/upload/UploadGuardHost";
import type { AppDispatch } from "@/lib/redux/store";

// --- injected identity -----------------------------------------------------

/** The app's Redux-backed credential source — read fresh per call. */
const credentials: CredentialsPort = {
  get: async (): Promise<MatrxCredential | null> => {
    const store = getStoreSingleton();
    if (!store) return null;
    const state = store.getState();
    const accessToken = selectAccessToken(state);
    if (accessToken) return { kind: "user", accessToken };
    const fingerprintId = selectFingerprintId(state);
    if (fingerprintId) return { kind: "guest", fingerprintId };
    return null;
  },
};

/**
 * Organization admission is transport identity, not file metadata — so it is
 * enforced HERE, at the one fetch boundary the host injects into the package.
 * Session minting, metadata, bytes, shares, and uploads all pass through this
 * function, which is the only reason they cannot drift into different
 * admission behavior.
 *
 * WHY THIS LIVES AT THE TRANSPORT AND NOT AROUND `ensureSession`: the host
 * used to wrap the client's public `ensureSession` with the admission wait.
 * That guarded exactly one door. The package mints internally too — every
 * private-media retry goes through `recoverLoadError` -> `session.ensure({
 * force: true })`, which never touches the host's wrapper — so authenticated
 * mints kept firing before the app-context organization had hydrated and kept
 * being refused: 124 `[AUTH][REJECT] POST /files/session` in 15 minutes from a
 * single user, 23 minutes AFTER the wrapper shipped (production, 2026-08-31).
 * A gate that only covers the door you remembered is not a gate.
 *
 * The rule, applied to every request the package makes:
 *   - No `Authorization` header -> the fingerprint-guest lane or a cookie-
 *     authenticated byte GET. The server admits both without an organization
 *     (an `<img>` tag cannot send one at all). Sent untouched.
 *   - `Authorization` present -> the JWT lane, which the server admits ONLY
 *     with a verifiable `X-Organization-Id`. Wait for the bootstrap, then
 *     bind it.
 *   - Bootstrap authoritatively finishes with NO organization -> refuse here
 *     rather than burn a guaranteed 400 at the gate, and say so once.
 */
async function filesFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);

  if (!headers.has("Authorization")) {
    return globalThis.fetch(input, { ...init, headers });
  }

  let organizationId = peekSelectedOrganizationId();
  if (!organizationId) {
    const admission = await waitForOrganizationAdmission();
    organizationId = admission === "ready" ? peekSelectedOrganizationId() : null;
  }

  if (!organizationId) {
    reportUnresolvedOrganizationOnce();
    // Never a silent skip and never a guaranteed-400 round trip: the package's
    // own failure handling sees a refusal with the status the gate would have
    // answered, and `recoverLoadError` reports it like any other mint failure.
    return new Response(
      JSON.stringify({
        detail: {
          error: "organization_required",
          code: "organization_required",
          message:
            "Refused before sending: this tab has an authenticated identity " +
            "but no active organization, and the server admits the JWT lane " +
            "only with one.",
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  resetUnresolvedOrganizationReport();
  headers.set("X-Organization-Id", organizationId);
  return globalThis.fetch(input, { ...init, headers });
}

/** The app's diagnostics sinks: Error Inspector capture + console scream. */
function diagnostics(event: FilesDiagnosticsEvent): void {
  if (event.source === "media-durability") {
    try {
      captureError({
        source: "media-durability",
        relation: event.context,
        message: event.message,
        details: event.detail ?? "",
        raw: { context: event.context, url: event.detail },
      });
    } catch {
      /* capture must never break the caller */
    }
    console.error(
      "\n================ MEDIA-DURABILITY VIOLATION ================\n" +
        `A non-public, EXPIRING media URL reached "${event.context}".\n` +
        "This must never be persisted/rendered for public or owned media — it WILL\n" +
        "break when the signature expires. The media should have been saved PUBLIC\n" +
        "at generation (durable CDN/public-bucket URL), or resolved from its\n" +
        "file_id (which re-mints a durable URL forever).\n" +
        `URL: ${(event.detail ?? "").slice(0, 180)}\n` +
        "===========================================================\n",
    );
    return;
  }
  console.warn(`[${event.source}] ${event.message}`, event.detail ?? "");
}

/** The Redux file store as the metadata source, so resolution and the store
 * never disagree. `peek` reports metadata only once the render fields are
 * loaded — the same freshness vocabulary the store's hydration uses. */
function toMetadata(record: CloudFile): FileMetadata {
  return {
    mimeType: record.mimeType ?? null,
    visibility: record.visibility ?? null,
    cdnUrl: record.cdnUrl ?? null,
    publicUrl: record.publicUrl ?? null,
    thumbnailUrl: record.thumbnailUrl ?? null,
    deletedAt: record.deletedAt ?? null,
    fileName: record.fileName ?? null,
  };
}

const metadata: FileMetadataPort = {
  peek(fileId: string): FileMetadata | undefined {
    const store = getStoreSingleton();
    if (!store) return undefined;
    const record = selectFileById(store.getState(), fileId);
    if (!areCloudFileFieldsLoaded(record, FILE_RENDER_FIELDS)) return undefined;
    return record ? toMetadata(record) : undefined;
  },
  async hydrate(fileId: string): Promise<FileMetadata | undefined> {
    const store = getStoreSingleton();
    if (!store) return undefined;
    await (store.dispatch as AppDispatch)(
      ensureCloudFileFields({ fileId, fields: FILE_RENDER_FIELDS }),
    );
    const record = selectFileById(store.getState(), fileId);
    return record ? toMetadata(record) : undefined;
  },
};

/** Files at/over the package's 80 MB threshold ride today's real resumable
 * lane: the fileHandler upload path (TUS transport + IndexedDB resume). */
async function largeUploadTransport(
  file: File,
  opts: MediaUploadOptions,
): Promise<MediaUploadResult> {
  const normalized = await fileHandler.upload(
    { kind: "file", file },
    {
      fileName: opts.fileName,
      visibility: opts.visibility as Visibility | undefined,
      metadata: opts.metadata,
      onProgress: opts.onProgress,
    },
  );
  const ref: MediaRef = {
    file_id: normalized.fileId,
    url: normalized.url ?? undefined,
    mime_type: normalized.meta?.mime ?? undefined,
  };
  return { fileId: normalized.fileId, ref };
}

/** The host batch door: SHA-256 dedup pre-flight + folder-id targeting. */
async function uploadMany(
  files: File[],
  opts: MediaUploadOptions,
): Promise<MediaMultiUploadResult> {
  const { uploaded, failed, cancelled } = await requestUpload({
    files,
    parentFolderId: opts.parentFolderId ?? null,
    folderPath: null,
    visibility: (opts.visibility as Visibility | undefined) ?? "personal",
    metadata: opts.metadata,
  });
  return { uploaded, failed, cancelled };
}

// --- the unresolved-organization report ------------------------------------

/** Once per transition, not per call: a media grid retrying its private pixels
 * must not fan one condition into hundreds of identical screams. */
let reportedUnresolvedOrganization = false;

function reportUnresolvedOrganizationOnce(): void {
  if (reportedUnresolvedOrganization) return;
  reportedUnresolvedOrganization = true;
  diagnostics({
    source: "files-session",
    context: "organization-admission",
    message:
      "refused a file request: this tab has an authenticated identity but " +
      "no active organization to be admitted under",
    detail:
      "Private media stays unavailable until an organization is selected; " +
      "requests resume the moment one is.",
  });
}

function resetUnresolvedOrganizationReport(): void {
  reportedUnresolvedOrganization = false;
}

// --- the ONE client --------------------------------------------------------

export const mediaFilesClient: MatrxFilesClient<DurableSrc> =
  createMatrxFilesClient<DurableSrc>({
    credentials,
    filesBaseUrl: () => resolveFilesBaseUrl(),
    // Cookies are per-host: the main backend and the standalone files host
    // both serve durable byte URLs, so the session lands on BOTH.
    sessionBases: [() => resolveBaseUrl(), () => resolveFilesBaseUrl()],
    fetchImpl: filesFetch,
    diagnostics,
    metadata,
    blobCache: {
      get: getCached,
      hydrate: hydrateFromIdb,
      set: setCached,
      invalidate,
    },
    largeUploadTransport,
    uploadMany,
  });

/** The same instance through `@ai-matrx/media`'s port — the assignment is the
 * compile-time proof; no cast, no adapter body. */
export const mediaClient: MediaClient = mediaFilesClient;
