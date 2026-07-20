import { CloudFolders } from "../../utils/folder-conventions";

const TOP_LEVEL_FOLDERS: Readonly<Record<string, string>> = {
  userContent: "My Files",
  images: CloudFolders.IMAGES,
  Images: CloudFolders.IMAGES,
  audio: CloudFolders.AUDIO,
  Audio: CloudFolders.AUDIO,
  "audio-recordings": CloudFolders.AUDIO_RECORDINGS,
  documents: CloudFolders.DOCUMENTS,
  Documents: CloudFolders.DOCUMENTS,
  code: CloudFolders.CODE,
  Code: CloudFolders.CODE,
  "any-file": "Uploads",
  attachments: CloudFolders.CHAT_ATTACHMENTS,
};

/** Compose a canonical Files folder path from an optional logical root. */
export function composeUploadFolderPath(
  root: string = "Uploads",
  path?: string,
): string {
  const top = (TOP_LEVEL_FOLDERS[root] ?? root).replace(/^\/+|\/+$/g, "");
  const sub = (path ?? "").replace(/^\/+|\/+$/g, "");
  return sub ? `${top}/${sub}` : top;
}
