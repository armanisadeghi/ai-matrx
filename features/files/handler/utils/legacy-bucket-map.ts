/**
 * features/files/handler/utils/legacy-bucket-map.ts
 *
 * Shared "legacy bucket name → cld_files top-level folder" map. The
 * old `useFileUploadWithStorage` hook (and the components that wrapped
 * it) accepted a `bucket` string like `"user-public-assets"` and
 * routed bytes to the matching Supabase Storage bucket. We deleted
 * Supabase Storage; the same string values are now treated as legacy
 * aliases for cld_files top-level folders, mapped here.
 *
 * Used by:
 *   - components/ui/file-upload/FileUploadWithStorage.tsx (dropzone)
 *   - components/ui/file-upload/PasteImageHandler.tsx (clipboard paste)
 *   - features/agents/components/inputs/smart-input/AgentTextarea.tsx
 *   - features/cx-conversation/ConversationInput.tsx
 *   - features/cx-chat/components/user-input/ConversationInput.tsx
 *   - features/prompts/components/{PromptInput, smart/CompactPromptInput,
 *     smart/SmartPromptInput}.tsx
 *   - features/resource-manager/resource-picker/UploadResourcePicker.tsx
 *
 * New code should accept a `folderPath` directly and skip this map.
 */

import { CloudFolders } from "@/features/files/utils/folder-conventions";

export function mapLegacyBucket(bucket: string): string {
  switch (bucket) {
    case "user-public-assets":
      return "Shared Assets";
    case "user-private-assets":
      return "Private Assets";
    case "images":
    case "Images":
      return CloudFolders.IMAGES;
    case "audio":
    case "Audio":
      return CloudFolders.AUDIO;
    case "audio-recordings":
      return CloudFolders.AUDIO_RECORDINGS;
    case "documents":
    case "Documents":
      return CloudFolders.DOCUMENTS;
    case "code":
    case "Code":
      return CloudFolders.CODE;
    case "userContent":
      return "My Files";
    case "any-file":
      return "Uploads";
    case "attachments":
      return CloudFolders.CHAT_ATTACHMENTS;
    default:
      return bucket;
  }
}

/** Compose a folder path from a legacy `bucket` + optional sub-`path`. */
export function composeLegacyFolderPath(bucket: string, path?: string): string {
  const top = mapLegacyBucket(bucket).replace(/^\/+|\/+$/g, "");
  const sub = (path ?? "").replace(/^\/+|\/+$/g, "");
  return sub ? `${top}/${sub}` : top;
}
