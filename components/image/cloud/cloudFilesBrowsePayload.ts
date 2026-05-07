import type { ResolvedCloudUrl } from "@/components/image/cloud/resolveCloudFileUrl";

interface BrowsePayloadFile {
  id: string;
  fileName: string;
}

export interface CloudFilesBrowsePayload {
  images: string[];
  alts: string[];
  initialIndex: number;
}

export async function buildCloudFilesBrowsePayload({
  imageRows,
  activeFileId,
  resolveUrl,
}: {
  imageRows: BrowsePayloadFile[];
  activeFileId: string;
  resolveUrl: (fileId: string) => Promise<ResolvedCloudUrl>;
}): Promise<CloudFilesBrowsePayload> {
  const resolved = await Promise.all(
    imageRows.map((file) => resolveUrl(file.id).catch(() => null)),
  );
  const images: string[] = [];
  const alts: string[] = [];
  let initialIndex = 0;

  for (let i = 0; i < imageRows.length; i += 1) {
    const resolvedUrl = resolved[i];
    if (!resolvedUrl) continue;
    if (imageRows[i].id === activeFileId) initialIndex = images.length;
    images.push(resolvedUrl.url);
    alts.push(imageRows[i].fileName);
  }

  return { images, alts, initialIndex };
}
