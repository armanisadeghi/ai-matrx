/**
 * features/image-manager/lib/images-surface-scope.ts
 *
 * Runtime scope builder for the `matrx-user/images` surface (the image library
 * at `/images/my-cloud`, rendered by `components/image/cloud/CloudImagesTab`).
 *
 * FILE DOCTRINE (features/files/handler/FEATURE.md) — LOAD-BEARING:
 * a raw signed URL (`?X-Amz-…`) or an S3 storage location must NEVER leave this
 * module. Images are emitted as DURABLE refs only: the file UUID always, plus
 * `public_url` ONLY when `isSignedUrl()` confirms the stored URL is a permanent
 * CDN URL rather than an expiring one. Agents resolve bytes from the id.
 */

import { isSignedUrl } from "@/lib/media/signed-url";
import type { CloudFileRecord } from "@/features/files/types";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import {
  createImagesScope,
  type ImagesImageSummary,
} from "@/features/surfaces/manifests/images.manifest";

/** Cap on emitted row arrays — protects the agent context window. */
const MAX_ROWS = 200;

/**
 * Durable public URL, or `null`. A signed/expiring URL is dropped on the floor:
 * the id is the durable reference and the only thing an agent should use.
 */
function durablePublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (isSignedUrl(url)) return null;
  return url;
}

function toSummary(file: CloudFileRecord): ImagesImageSummary {
  return {
    id: file.id,
    name: file.fileName,
    path: file.filePath,
    mime_type: file.mimeType,
    size: file.fileSize,
    visibility: file.visibility,
    updated_at: file.updatedAt,
    public_url: durablePublicUrl(file.publicUrl),
  };
}

export interface BuildImagesScopeInput {
  /** Image rows currently in scope after search + recents filter, in display order. */
  visibleImages: CloudFileRecord[];
  /** Every non-deleted image in the library, ignoring search and filters. */
  totalImageCount: number;
  /** Bulk-checkbox-selected image rows. */
  selectedImages: CloudFileRecord[];
  searchQuery: string;
  recentsOnly: boolean;
  viewMode: string;
  selectionMode: string;
  treeStatus: string;
  bulkOperation: string | null;
  /** Text the user highlighted on the page, when the caller captured it. */
  selection?: string;
}

export function buildImagesScope(
  input: BuildImagesScopeInput,
): SurfaceScopePayload {
  const visible = input.visibleImages.slice(0, MAX_ROWS);
  const query = input.searchQuery.trim();
  const selected = input.selectedImages;

  return createImagesScope({
    selection: input.selection?.trim() || undefined,

    // Library query and view
    search_query: query || undefined,
    recents_only: input.recentsOnly,
    view_mode: input.viewMode,
    library_query_summary: {
      search_query: query,
      recents_only: input.recentsOnly,
      view_mode: input.viewMode,
      selection_mode: input.selectionMode,
    },

    // Visible images
    visible_image_count: input.visibleImages.length,
    total_image_count: input.totalImageCount,
    visible_images: visible.map(toSummary),
    visible_image_ids: visible.map((file) => file.id),

    // Selection
    selected_count: selected.length,
    selection_mode: input.selectionMode,
    selected_image_ids:
      selected.length > 0 ? selected.map((file) => file.id) : undefined,
    selected_image_names:
      selected.length > 0 ? selected.map((file) => file.fileName) : undefined,
    selected_images:
      selected.length > 0 ? selected.map(toSummary) : undefined,

    // Library status
    tree_status: input.treeStatus,
    bulk_operation: input.bulkOperation ?? undefined,
  });
}
