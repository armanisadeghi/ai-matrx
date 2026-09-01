/**
 * features/files/handler/resolver.ts
 *
 * The intelligence layer. Takes a freshly-normalized `NormalizedFile`
 * (output of `input/normalize.ts`) and:
 *
 *   1. Hydrates from Redux when a fileId is known
 *   2. Fetches `/files/{id}` if missing from the slice
 *   3. Decides origin + capabilities (owned/shared/public/external)
 *   4. Binds the durable render URL (synchronous — durable URLs are a
 *      pure function of the file id and never expire)
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
import {
  apiFileRecordToCloudFile,
  dbRowToCloudFile,
} from "@/features/files/redux/converters";
import { readFileRowById } from "@/features/files/filesDb";
import { supabase } from "@/utils/supabase/client";
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
import { sniffMimeFromBlob } from "./intelligence/magic-bytes";
import { pythonFileInlineUrl } from "./utils/python-base";
import { fromCloudFile } from "./input/normalize";
import { classify } from "./utils/classify";
import type { NormalizedFile } from "./types";

interface ResolveOpts {
  /** When true, the resolver binds the durable URL if owned and missing one. */
  needsUrl?: boolean;
  /** When true, the resolver will fetch bytes to sniff MIME if missing. */
  sniffMime?: boolean;
}

/**
 * Take a `NormalizedFile` produced by `normalize()` and finish the job:
 * hydrate, decide access, bind the durable URL. Idempotent — calling
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
    result = ensureDurableUrl(result);
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

  // `selectFileById` already returns a fully-typed `CloudFileRecord`
  // (`extends CloudFile`) straight from our own reducer-typed state — no
  // re-validation needed. `undefined` (not cached) normalizes to `null`.
  let cloudFile: import("@/features/files/types").CloudFile | null =
    cached ?? null;

  // Newly-created files can reach a consumer before the file-tree hydration
  // fills the placeholder's durable path. An id-bearing placeholder is not a
  // complete cache hit: versioned writes require the canonical path so the
  // backend updates the existing row instead of creating a sibling.
  if (!cloudFile?.filePath) {
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

  // REST FileRecord is optimized for rendering and older deployed servers do
  // not expose `organization_id`. A version write cannot infer ownership from
  // ambient UI context: the existing row is authoritative. Hydrate the one
  // canonical DB row whenever organization identity is absent, retaining any
  // server-computed URL fields already present on the REST/cache envelope.
  if (!cloudFile.organizationId) {
    const row = await readFileRowById(supabase, file.fileId);
    if (!row) {
      throw new FileNotFoundError(undefined, { fileId: file.fileId });
    }
    const canonical = dbRowToCloudFile(row);
    cloudFile = {
      ...canonical,
      publicUrl: cloudFile.publicUrl ?? canonical.publicUrl,
      url: cloudFile.url ?? canonical.url,
      cdnUrl: cloudFile.cdnUrl ?? canonical.cdnUrl,
      downloadUrl: cloudFile.downloadUrl ?? canonical.downloadUrl,
      thumbnailUrl: cloudFile.thumbnailUrl ?? canonical.thumbnailUrl,
    };
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
// Durable URL binding (synchronous — a pure function of the file id)
// ---------------------------------------------------------------------------

function ensureDurableUrl(file: NormalizedFile): NormalizedFile {
  if (!file.fileId || file.url) return file;
  // The durable inline URL never expires; a plain `<img>` binding
  // authenticates via the `mx_files_session` cookie, and `fetch()`es via
  // the python-client attach Authorization headers — so it is fetch-safe.
  return {
    ...file,
    url: pythonFileInlineUrl(file.fileId),
    lifecycle: {
      ...file.lifecycle,
      lastVerifiedAt: Date.now(),
    },
    capabilities: {
      ...file.capabilities,
      transportSafeForFetch: true,
    },
  };
}

// ---------------------------------------------------------------------------
// MIME sniffing
// ---------------------------------------------------------------------------

async function sniffIfPossible(file: NormalizedFile): Promise<NormalizedFile> {
  if (!file.url || file.url.startsWith("data:")) return file;
  try {
    const res = await fetch(file.url, {
      method: "GET",
      headers: { Range: "bytes=0-31" },
    });
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
