/**
 * Names and scope builder of `image-studio`, kept apart from the manifest body so
 * eagerly loaded features can import them without pulling the manifest
 * (descriptions, write targets) into the shell's first-load JS.
 */
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";

export const IMAGE_STUDIO_SURFACE_NAME = "matrx-user/image-studio";

export interface StudioPresetCatalogEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  category: string;
}

export interface StudioSourceFileSummary {
  name: string;
  filename_base: string;
  mime_type: string;
  size: number;
  width: number | null;
  height: number | null;
  status: string;
  variant_count: number;
  metadata_status: string;

  /**
   * The authored description fields — the read twin of the
   * `image_description` write target. Empty strings / empty arrays until
   * Describe with AI runs or an agent writes them, so the evidence loop
   * (read what is there, write what is missing) closes on this surface
   * rather than leaving a write nobody can verify.
   */
  alt_text: string;
  caption: string;
  title: string;
  description: string;
  keywords: string[];
  dominant_colors: string[];
}

export interface StudioLastSaveResult {
  folder_path: string;
  saved_count: number;
  failed_filenames: string[];
}

/**
 * Scope builder for `matrx-user/image-studio`.
 *
 * Required (no `?`) keys mirror every `alwaysAvailable: true` value — the
 * studio writes them on every launch regardless of UI state.
 */
export function createImageStudioScope(values: {
  selection?: string;
  context?: Record<string, unknown>;

  // Source images
  source_file_count: number;
  source_files: StudioSourceFileSummary[];

  // Conversion settings
  available_presets: StudioPresetCatalogEntry[];
  selected_preset_ids: string[];
  selected_preset_count: number;
  output_format: string;
  output_quality: number;
  background_color: string;
  resize_fit: string;
  resize_position: string;
  studio_settings_summary: Record<string, unknown>;

  // Generated output
  total_variant_count: number;
  generated_variant_count: number;
  total_output_bytes: number;
  last_save_result?: StudioLastSaveResult;
  studio_error?: string;

  // Activity
  is_processing: boolean;
  is_saving: boolean;
  is_describing: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
