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
  selectOrganizationId,
  selectOrgBootstrapResolved,
} from "@/lib/redux/slices/appContextSlice";
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
 * Organization admission is transport identity, not file metadata. The data
 * package owns credential headers; the host adds the active organization at
 * its one injected fetch boundary so session minting, metadata, bytes, shares,
 * and uploads cannot drift into different admission behavior.
 *
 * Guest requests deliberately carry no organization: the server admits the
 * fingerprint lane without one. Authenticated requests never guess an
 * organization; the session mint WAITS for the active-organization bootstrap
 * (see `ensureSession` below) instead of burning refused requests at the gate.
 */
async function filesFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const store = getStoreSingleton();
  if (store) {
    const organizationId = selectOrganizationId(store.getState());
    if (organizationId) headers.set("X-Organization-Id", organizationId);
  }
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

// --- organization admission for the session mint ---------------------------

/**
 * How long the mint waits for the active-organization bootstrap before giving
 * up. The bootstrap is a rehydrate (IDB/localStorage) plus, on a cold boot, an
 * idle-scheduled remote reconcile — seconds, not minutes. A wait that outlives
 * this window is a broken bootstrap, and the mint says so rather than hanging
 * forever or hammering a gate that will refuse it.
 */
const ORGANIZATION_ADMISSION_TIMEOUT_MS = 30_000;

type OrganizationAdmission = "ready" | "unresolved";

/**
 * Resolve as soon as the active organization exists, or once the bootstrap has
 * authoritatively resolved WITHOUT one. `null` means "still booting" — the
 * caller keeps waiting rather than treating a hollow pre-hydration read as an
 * answer.
 */
function readOrganizationAdmission(
  state: unknown,
): OrganizationAdmission | null {
  const appContextState = state as Parameters<typeof selectOrganizationId>[0];
  if (selectOrganizationId(appContextState)) return "ready";
  if (selectOrgBootstrapResolved(appContextState)) return "unresolved";
  return null;
}

function waitForOrganizationAdmission(): Promise<OrganizationAdmission> {
  const store = getStoreSingleton();
  if (!store) return Promise.resolve("unresolved");

  const immediate = readOrganizationAdmission(store.getState());
  if (immediate) return Promise.resolve(immediate);

  return new Promise<OrganizationAdmission>((resolve) => {
    let settled = false;
    let unsubscribe: (() => void) | null = null;
    const finish = (verdict: OrganizationAdmission) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve(verdict);
    };
    const timer = setTimeout(
      () => finish("unresolved"),
      ORGANIZATION_ADMISSION_TIMEOUT_MS,
    );
    unsubscribe = store.subscribe(() => {
      const verdict = readOrganizationAdmission(store.getState());
      if (verdict) finish(verdict);
    });
    // The bootstrap can land between the first read and the subscription.
    const raced = readOrganizationAdmission(store.getState());
    if (raced) finish(raced);
  });
}

/** The unresolved-organization report is once-per-transition, not per call:
 * a media grid retrying its private pixels must not fan one condition into
 * hundreds of identical screams. */
let reportedUnresolvedOrganization = false;

/**
 * The file-session mint, deferred until this tab has an admission identity.
 *
 * The mint fires at boot (`AuthSessionWatcher`, the moment an authenticated
 * identity exists) and again from every private-media retry — all before the
 * app-context organization has hydrated. Sending those requests anyway is how
 * a single user produced ~511 `[AUTH][REJECT] POST /files/session` rejections
 * in ~35 minutes on 2026-08-31: refused at the gate, retried, refused again.
 *
 * So: guests mint immediately (the fingerprint lane carries no organization),
 * and an authenticated mint waits for the organization to hydrate. If the
 * bootstrap authoritatively resolves with NO organization, the mint is skipped
 * and announced — never guessed, never burned against the gate.
 */
async function ensureSessionAfterOrganizationAdmission(
  client: MatrxFilesClient<DurableSrc>,
  opts?: { force?: boolean | undefined },
): Promise<void> {
  const credential = await credentials.get();
  if (credential?.kind === "user") {
    const admission = await waitForOrganizationAdmission();
    if (admission !== "ready") {
      if (!reportedUnresolvedOrganization) {
        reportedUnresolvedOrganization = true;
        diagnostics({
          source: "files-session",
          context: "organization-admission",
          message:
            "skipped the file-session mint: this tab has an authenticated " +
            "identity but no active organization to be admitted under",
          detail:
            "Private media stays unavailable until an organization is " +
            "selected; the mint re-runs the moment one is.",
        });
      }
      return;
    }
    reportedUnresolvedOrganization = false;
  }
  await client.ensureSession(opts);
}

// --- the ONE client --------------------------------------------------------

const filesClient = createMatrxFilesClient<DurableSrc>({
  credentials,
  filesBaseUrl: () => resolveFilesBaseUrl(),
  // Cookies are per-host: the main backend and the standalone files host
  // both serve durable byte URLs, so the session lands on BOTH.
  sessionBases: [() => resolveBaseUrl(), () => resolveFilesBaseUrl()],
  fetchImpl: filesFetch,
  diagnostics,
  metadata,
  blobCache: { get: getCached, hydrate: hydrateFromIdb, set: setCached },
  largeUploadTransport,
  uploadMany,
});

/** The package client with ONE host override: the session mint waits for
 * organization admission (above). Every other door is the package's. */
export const mediaFilesClient: MatrxFilesClient<DurableSrc> = {
  ...filesClient,
  ensureSession: (opts) =>
    ensureSessionAfterOrganizationAdmission(filesClient, opts),
};

/** The same instance through `@ai-matrx/media`'s port — the assignment is the
 * compile-time proof; no cast, no adapter body. */
export const mediaClient: MediaClient = mediaFilesClient;
