/**
 * features/media-capture/upload/capture-uploader.ts
 *
 * The ONE cloud boundary for captured media (plan §5 invariant 7): bytes go
 * through `fileHandler.upload` only — no capture-specific storage, no
 * `/api/camera/*` routes. Folder paths come from `folderForCaptures` (never
 * hand-rolled) and are ORG-NAMESPACED — captures file under the EFFECTIVE org
 * (`Captures/<orgId>/{Photos|Videos|Audio}`) so each workspace gets a DISTINCT
 * global folder path (the server pins one folder path per user to one org; a
 * flat `Captures/Videos` cannot exist under two orgs). "Effective" org =
 * explicit selection, else the user's personal org — so a user with no org
 * explicitly selected (the common soft-enforced state) STILL gets a nested
 * path, never the flat `Captures/Videos`. The flat path is only the pre-boot /
 * test fallback (no store, or org bootstrap unresolved).
 *
 * Visibility stays `personal` either way (`resolveDefaultVisibility` keys on
 * the `Captures` prefix). Org is filing, not access: personal files are
 * owner-gated regardless of org, so the org-in-path is doctrine-safe and is
 * what makes the folder collision-free. With an org resolved we
 * `inheritActiveScope: true` so the folder+file row are owned by that org,
 * matching the path segment.
 *
 * `metadata.capture` is validated with `isCaptureMetadata` BEFORE any bytes
 * leave — a payload carrying a deviceId/groupId/label or a malformed variant
 * throws loudly here rather than persisting a contract violation.
 */

import { fileHandler } from "@/features/files/handler/handler";
import {
  folderForCaptures,
  resolveDefaultVisibility,
} from "@/features/files/utils/folder-conventions";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import type { RootState } from "@/lib/redux/store";
import type { NormalizedFile } from "@/features/files/handler/types";
import {
  isCaptureMetadata,
  type CaptureMetadata,
} from "@/features/media-capture/core/capture-types";
import { recordCaptureFailure } from "@/features/media-capture/runtime/mediaCaptureDiagnostics";

/**
 * The org id captures file under. Uses the EFFECTIVE org (explicit selection,
 * else the user's personal org) — the same fallback the API/scope layer is
 * meant to use (`selectEffectiveOrganizationId` doc). This matters: a user with
 * no org EXPLICITLY selected (the common soft-enforced state) still resolves to
 * their personal org, so the capture path is ALWAYS org-namespaced and NEVER
 * the flat `Captures/Videos` — which is what a stale, mis-scoped flat folder
 * would collide with. Null only before the org bootstrap resolves (or in tests
 * with no store), where we fall back to the flat path + no inherit.
 */
function activeOrganizationId(): string | null {
  const store = getStoreSingleton();
  if (!store) return null;
  const state = store.getState() as RootState;
  return selectEffectiveOrganizationId(state);
}

/**
 * Canonical folder for a captured artifact kind, org-namespaced when an org id
 * is supplied. Delegates to `folderForCaptures`; call with the active org id
 * so captures file under the active workspace collision-free.
 */
export function captureFolderFor(
  artifactKind: CaptureMetadata["artifact_kind"],
  orgId?: string | null,
): string {
  return folderForCaptures(artifactKind, orgId);
}

export interface UploadCaptureArgs {
  file: File;
  capture: CaptureMetadata;
  onProgress?: (loaded: number, total: number) => void;
}

/**
 * Upload one captured artifact. Returns the hydrated NormalizedFile — persist
 * `fileId`, never a URL (renders go through `<InlineMediaRef>`).
 */
export async function uploadCapture(
  args: UploadCaptureArgs,
): Promise<NormalizedFile> {
  if (!isCaptureMetadata(args.capture)) {
    // Loud by design: an invalid payload here means a builder or caller bug
    // (unknown keys, camelCase drift, or a hardware identifier leaked in).
    throw new Error(
      "[capture-uploader] metadata.capture failed isCaptureMetadata validation — " +
        "refusing to upload. Fix the builder/caller; never persist an invalid " +
        `capture payload. Got: ${JSON.stringify(args.capture)}`,
    );
  }

  const activeOrgId = activeOrganizationId();
  const folderPath = captureFolderFor(args.capture.artifact_kind, activeOrgId);
  try {
    const uploaded = await fileHandler.upload(
      { kind: "file", file: args.file },
      {
        folderPath,
        visibility: resolveDefaultVisibility(folderPath),
        fileName: args.file.name,
        metadata: { capture: args.capture },
        // Org is filing, not access: inherit the active scope ONLY when an org
        // is selected, so the org-namespaced folder+file row are owned by that
        // org (matching the path segment). With no active org the flat legacy
        // path belongs to the personal org — do NOT inherit. Visibility stays
        // `personal` regardless (owner-gated), so this is doctrine-safe.
        inheritActiveScope: activeOrgId ? true : false,
        ...(args.onProgress ? { onProgress: args.onProgress } : {}),
      },
    );

    if (!uploaded.fileId) {
      throw new Error(
        "[capture-uploader] upload resolved without a fileId — the capture is " +
          "not durably addressable. Treat as an upload failure.",
      );
    }
    return uploaded;
  } catch (err) {
    // Terminal upload failure → diagnostics ring, WITH the retry payload so
    // /camera and the Media window can re-invoke this uploader. The error
    // still propagates — recording it never swallows it.
    recordCaptureFailure({
      scope: "upload",
      message:
        err instanceof Error
          ? err.message
          : `Upload of "${args.file.name}" failed.`,
      retry: { file: args.file, capture: args.capture },
    });
    throw err;
  }
}
