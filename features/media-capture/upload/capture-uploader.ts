/**
 * features/media-capture/upload/capture-uploader.ts
 *
 * The ONE cloud boundary for captured media (plan §5 invariant 7): bytes go
 * through `fileHandler.upload` only — no capture-specific storage, no
 * `/api/camera/*` routes. Folder paths come from `folderForCaptures` (never
 * hand-rolled) and are ORG-NAMESPACED — captures file under the EXPLICIT
 * active org (`Captures/<orgId>/{Photos|Videos|Audio}`) so each workspace gets
 * a DISTINCT global folder path (the server pins one folder path per user to
 * one org; a flat `Captures/Videos` cannot exist under two orgs). An upload is
 * a WRITE, so there is no personal-workspace fallback: the uploader waits for
 * the workspace (bounded) and, when none is selected, REFUSES with the
 * workspace's own sentence — nothing is uploaded and the surface says why.
 *
 * Visibility stays `personal` (`resolveDefaultVisibility` keys on the
 * `Captures` prefix). Org is filing, not access: personal files are
 * owner-gated regardless of org, so the org-in-path is doctrine-safe and is
 * what makes the folder collision-free. `inheritActiveScope: true` makes the
 * folder+file row owned by that org, matching the path segment.
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
import { awaitEffectiveOrganizationId } from "@/features/organizations/awaitWorkspace";
import type { NormalizedFile } from "@/features/files/handler/types";
import {
  isCaptureMetadata,
  type CaptureMetadata,
} from "@/features/media-capture/core/capture-types";
import { recordCaptureFailure } from "@/features/media-capture/runtime/mediaCaptureDiagnostics";

/**
 * The org a capture files under: the EXPLICIT active organization, waited for
 * while the bootstrap is still in flight and refused by name when there is
 * none. It used to read the effective org — explicit selection ELSE the user's
 * personal workspace — so a capture taken with no organization selected was
 * silently filed into a personal workspace nobody chose, with only the folder
 * path (never on screen) recording where it went. An upload is a write: with
 * no organization it refuses and says so instead.
 */
async function requireCaptureOrganizationId(): Promise<string> {
  const workspace = await awaitEffectiveOrganizationId();
  if (workspace.status !== "ready") {
    throw new Error(`[capture-uploader] ${workspace.reason}`);
  }
  return workspace.organizationId;
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

  const activeOrgId = await requireCaptureOrganizationId();
  const folderPath = captureFolderFor(args.capture.artifact_kind, activeOrgId);
  try {
    const uploaded = await fileHandler.upload(
      { kind: "file", file: args.file },
      {
        folderPath,
        visibility: resolveDefaultVisibility(folderPath),
        fileName: args.file.name,
        metadata: { capture: args.capture },
        // Org is filing, not access: the folder+file row are owned by the org
        // whose segment the path carries. Visibility stays `personal`
        // regardless (owner-gated), so this is doctrine-safe.
        inheritActiveScope: true,
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
