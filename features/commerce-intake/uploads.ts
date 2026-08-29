/**
 * features/commerce-intake/uploads.ts
 *
 * The ONE cloud boundary of the intake capture app: every byte (photo JPEG,
 * video blob, voice note) goes through `fileHandler.upload` into the asset's
 * (or, in untracked mode, the batch's) fixed folder —
 * `Commerce Intake/<orgId>/<batchId>/<asset-or-batch-leaf>` — then the
 * resulting `file_id` is recorded on a `commerce.intake_artifact` row.
 *
 * Files upload with explicit `visibility: "internal"` + `inheritActiveScope`:
 * anyone in the warehouse org can pick up an item, and the intake pipeline
 * reads them without per-user grants. `metadata.commerce_intake` stamps the
 * batch/asset linkage on the file itself so it survives outside the DB rows.
 */

import { fileHandler } from "@/features/files/handler/handler";
import type { NormalizedFile } from "@/features/files/handler/types";
import { folderForIntakeAsset } from "@/features/files/utils/folder-conventions";

import type { ArtifactKind, IntakeArtifact } from "./types";
import { recordArtifact } from "./service";

export interface UploadArtifactResult {
  uploaded: NormalizedFile;
  artifact: IntakeArtifact;
}

/** Upload one capture and record its artifact row. `assetId: null` is the
 *  untracked-mode batch-level stream (segmentation mints assets later). */
export async function uploadIntakeArtifact(args: {
  organizationId: string;
  batchId: string;
  assetId: string | null;
  /** Folder leaf — the asset id in serialized mode, the batch id untracked. */
  folderLeaf: string;
  file: File;
  kind: ArtifactKind;
  sequenceIndex: number;
  isDelineator?: boolean;
  durationMs?: number | null;
  onProgress?: (loaded: number, total: number) => void;
}): Promise<UploadArtifactResult> {
  const uploaded = await fileHandler.upload(
    { kind: "file", file: args.file },
    {
      folderPath: folderForIntakeAsset(
        args.organizationId,
        args.batchId,
        args.folderLeaf,
      ),
      visibility: "internal",
      fileName: args.file.name,
      metadata: {
        commerce_intake: {
          batch_id: args.batchId,
          asset_id: args.assetId,
          kind: args.kind,
          is_delineator: args.isDelineator ?? false,
        },
      },
      inheritActiveScope: true,
      ...(args.onProgress ? { onProgress: args.onProgress } : {}),
    },
  );
  if (!uploaded.fileId) {
    throw new Error(
      "[commerce-intake] upload resolved without a fileId — the capture is " +
        "not durably addressable. Treat as an upload failure.",
    );
  }
  const artifact = await recordArtifact({
    batchId: args.batchId,
    assetId: args.assetId,
    organizationId: args.organizationId,
    fileId: uploaded.fileId,
    kind: args.kind,
    sequenceIndex: args.sequenceIndex,
    isDelineator: args.isDelineator ?? false,
    durationMs: args.durationMs ?? null,
  });
  return { uploaded, artifact };
}
