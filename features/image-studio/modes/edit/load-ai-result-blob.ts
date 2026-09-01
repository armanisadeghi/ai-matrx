import { fileHandler } from "@/features/files/handler/handler";

interface AiResultBlobSource {
  fileId?: string;
  url: string;
}

/**
 * Load AI-operation bytes without bypassing the authenticated owned-file
 * transport. Provider-only URLs remain fetchable directly.
 */
export async function loadAiResultBlob({
  fileId,
  url,
}: AiResultBlobSource): Promise<Blob> {
  if (fileId) {
    return fileHandler
      .use({ kind: "file_id", fileId })
      .as({ kind: "blob" });
  }

  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error(`Fetch ${url} → ${response.status}`);
  return response.blob();
}
