// features/code-files/service/s3Service.ts
//
// Direct browser → Python content transport for code files. No Next.js hop.
// Goes through the universal file handler so code files share the same
// `cld_files` storage, RLS, and signed-URL refresh logic as every other
// file flow in the app.

import { fileHandler } from "@/features/files/handler/handler";
import { CloudFolders } from "@/features/files/utils/folder-conventions";

export interface S3UploadResult {
  s3_key: string;
  s3_bucket: string;
  size: number;
}

export interface S3UploadArgs {
  fileId: string;
  content: string;
  contentType?: string;
}

const CLOUD_FILES_BUCKET = "cloud-files";

export async function uploadCodeFileToS3(
  args: S3UploadArgs,
): Promise<S3UploadResult> {
  const contentType = args.contentType ?? "text/plain; charset=utf-8";
  const blob = new Blob([args.content], { type: contentType });
  const file = new File([blob], `${args.fileId}.txt`, { type: contentType });

  const normalized = await fileHandler.upload(
    { kind: "file", file },
    {
      folderPath: CloudFolders.CODE_EDITOR,
      visibility: "private",
      metadata: { origin: "code-editor", code_file_id: args.fileId },
    },
  );

  if (!normalized.fileId) {
    throw new Error("Code file upload returned no fileId");
  }

  return {
    s3_key: normalized.fileId,
    s3_bucket: CLOUD_FILES_BUCKET,
    size: normalized.meta.sizeBytes ?? blob.size,
  };
}

export interface S3DownloadArgs {
  s3_key: string;
  s3_bucket: string;
}

export async function downloadCodeFileFromS3(
  args: S3DownloadArgs,
): Promise<string> {
  const blob = await fileHandler.use({ kind: "file_id", fileId: args.s3_key }).as({
    kind: "blob",
  });
  return blob.text();
}

export interface S3DeleteArgs {
  s3_key: string;
  s3_bucket: string;
}

export async function deleteCodeFileFromS3(args: S3DeleteArgs): Promise<void> {
  const Files = await import("@/features/files/api/files");
  await Files.deleteFile(args.s3_key, { hardDelete: true }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn("[s3Service] delete failed (non-fatal)", err);
  });
}
