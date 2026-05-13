/**
 * features/files/handler/resolver.ts
 *
 * The intelligence layer. Takes a freshly-normalized `NormalizedFile`
 * (output of `input/normalize.ts`) and:
 *
 *   1. Hydrates from Redux when a fileId is known
 *   2. Fetches `/files/{id}` if missing from the slice
 *   3. Decides origin + capabilities (owned/shared/public/external)
 *   4. Mints a signed URL when needed and watches expiry
 *   5. Sniffs MIME from magic bytes when unknown
 *   6. Translates backend failure modes into typed errors
 *
 * Pure(ish) — uses the imported store directly so callsites don't need
 * to hand it in. Hooks read the store's RootState; thunks operate via
 * dispatch. The resolver is a one-way function: given the same input,
 * the same Redux state, and the same network result, it produces the
 * same NormalizedFile.
 */

import type { RootState } from "@/lib/redux/store";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import * as Files from "@/features/files/api/files";
import { apiFileRecordToCloudFile } from "@/features/files/redux/converters";
import {
  selectFileById,
  selectPermissionsForResource,
} from "@/features/files/redux/selectors";
import {
  FileAccessDeniedError,
  FileDeletedError,
  FileNotFoundError,
} from "./errors";
import { decideForOwnedFile } from "./intelligence/access";
import { watchExpiry } from "./intelligence/expiry-wheel";
import { mintSignedUrl } from "./intelligence/refresh";
import { sniffMimeFromBlob } from "./intelligence/magic-bytes";
import { fromCloudFile } from "./input/normalize";
import { classify } from "./utils/classify";
import type { NormalizedFile } from "./types";

interface ResolveOpts {
  /** When true, the resolver will eagerly mint a signed URL if owned and missing one. */
  needsUrl?: boolean;
  /** When true, the resolver will fetch bytes to sniff MIME if missing. */
  sniffMime?: boolean;
  /** Override default 1h signed-URL lifetime. */
  signedExpiresIn?: number;
}

/**
 * Take a `NormalizedFile` produced by `normalize()` and finish the job:
 * hydrate, decide access, mint URLs, watch expiry. Idempotent — calling
 * twice with the same input returns equivalent results.
 */
export async function resolve(
  file: NormalizedFile,
  opts: ResolveOpts = {},
): Promise<NormalizedFile> {
  let result = file;

  if (result.fileId) {
    result = await hydrateFromFileId(result);
  }

  if (opts.needsUrl && result.fileId && !result.url) {
    result = await ensureSignedUrl(result, opts.signedExpiresIn);
  }

  if (opts.sniffMime && !result.meta.mime && !result.fileId) {
    result = await sniffIfPossible(result);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

async function hydrateFromFileId(
  file: NormalizedFile,
): Promise<NormalizedFile> {
  if (!file.fileId) return file;

  const store = getStoreSingleton();
  if (!store) throw new Error("file-handler: redux store not yet initialized");
  const state = store.getState() as RootState;
  const cached = selectFileById(state, file.fileId);

  let cloudFile = cached
    ? cloudFileFromRecord(cached)
    : null;

  if (!cloudFile) {
    try {
      const { data } = await Files.getFile(file.fileId);
      cloudFile = apiFileRecordToCloudFile(data);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 404) {
        throw new FileNotFoundError(undefined, { fileId: file.fileId });
      }
      if (status === 403) {
        throw new FileAccessDeniedError(undefined, { fileId: file.fileId });
      }
      throw err;
    }
  }

  if (cloudFile.deletedAt) {
    throw new FileDeletedError(undefined, { fileId: cloudFile.id });
  }

  const hydrated = fromCloudFile(cloudFile, file.__source);
  const permissions = selectPermissionsForResource(state, cloudFile.id);
  const decision = decideForOwnedFile(cloudFile, state, permissions);

  return {
    ...hydrated,
    origin: decision.origin,
    capabilities: decision.capabilities,
    url: file.url ?? hydrated.url,
    base64: file.base64,
    shareToken: file.shareToken,
    lifecycle: {
      ...hydrated.lifecycle,
      expiresAt: file.lifecycle.expiresAt,
      lastVerifiedAt: Date.now(),
    },
  };
}

// ---------------------------------------------------------------------------
// Signed URL minting + expiry wiring
// ---------------------------------------------------------------------------

async function ensureSignedUrl(
  file: NormalizedFile,
  expiresInSec?: number,
): Promise<NormalizedFile> {
  if (!file.fileId) return file;
  if (file.url && file.lifecycle.expiresAt && file.lifecycle.expiresAt > Date.now() + 30_000) {
    return file;
  }

  const fresh = await mintSignedUrl(file.fileId, expiresInSec);

  watchExpiry(file.fileId, fresh.expiresAt, async () => {
    await mintSignedUrl(file.fileId!, expiresInSec).catch(() => undefined);
  });

  return {
    ...file,
    url: fresh.url,
    lifecycle: {
      ...file.lifecycle,
      expiresAt: fresh.expiresAt,
      lastVerifiedAt: Date.now(),
    },
    capabilities: {
      ...file.capabilities,
      transportSafeForFetch: false,
    },
  };
}

// ---------------------------------------------------------------------------
// MIME sniffing
// ---------------------------------------------------------------------------

async function sniffIfPossible(
  file: NormalizedFile,
): Promise<NormalizedFile> {
  if (!file.url || file.url.startsWith("data:")) return file;
  try {
    const res = await fetch(file.url, { method: "GET", headers: { Range: "bytes=0-31" } });
    if (!res.ok) return file;
    const blob = await res.blob();
    const sniffed = await sniffMimeFromBlob(blob);
    if (!sniffed) return file;
    return {
      ...file,
      meta: classify({
        ...file.meta,
        mime: sniffed,
      }),
    };
  } catch {
    return file;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloudFileFromRecord(record: unknown): import("@/features/files/types").CloudFile | null {
  if (!record || typeof record !== "object") return null;
  const r = record as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    ownerId: (r.ownerId as string) ?? "",
    filePath: (r.filePath as string) ?? "",
    storageUri: (r.storageUri as string) ?? "",
    fileName: (r.fileName as string) ?? "",
    mimeType: (r.mimeType as string | null) ?? null,
    fileSize: (r.fileSize as number | null) ?? null,
    checksum: (r.checksum as string | null) ?? null,
    visibility: (r.visibility as "public" | "private" | "shared") ?? "private",
    currentVersion: (r.currentVersion as number) ?? 1,
    parentFolderId: (r.parentFolderId as string | null) ?? null,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    createdAt: (r.createdAt as string) ?? new Date().toISOString(),
    updatedAt: (r.updatedAt as string) ?? new Date().toISOString(),
    deletedAt: (r.deletedAt as string | null) ?? null,
    publicUrl: (r.publicUrl as string | null) ?? null,
    source: (r.source as { kind: "real" }) ?? { kind: "real" },
    parentFileId: (r.parentFileId as string | null | undefined) ?? null,
    derivationKind: (r.derivationKind as string | null | undefined) ?? null,
  };
}
