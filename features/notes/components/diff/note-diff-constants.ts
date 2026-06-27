import type { DiffOptions } from "@/components/diff/engine/types";

export const NOTE_EXCLUDE_PATHS = new Set([
  "id",
  "created_by",
  "created_at",
  "updated_at",
  "version",
  "sync_version",
  "content_hash",
  "last_device_id",
  "position",
  "deleted_at",
  "file_path",
]);

export const NOTE_DIFF_OPTIONS: DiffOptions = {
  excludePaths: NOTE_EXCLUDE_PATHS,
  skipUnderscorePrefix: true,
};

/** Fields that should render above the fold — content is king */
export const NOTE_PRIORITY_FIELDS = ["content", "label"];
