/**
 * features/agents/utils/media-variable-value.ts
 *
 * Shared read of a media-typed variable's stored value (image / audio /
 * video / document). The persisted value is either a canonical cld_files
 * file_id (a bare UUID) or a plain URL — see `MediaVariableInput`'s header
 * comment for the full contract.
 *
 * Every surface that shows a media variable's CURRENT value as a summary
 * (never the editable picker itself) must resolve the file_id through this
 * helper and render it with the canonical `FileResourceChip` — never the raw
 * id as text. That bug (a role-tagged image variable's collapsed row in
 * `AgentVariablesInline` printing the bare UUID) is closed by wiring every
 * such summary through here instead of `variableValueToDisplay`.
 */

// 36-char canonical UUID — what cld_files file_ids look like.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isMediaFileId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Coerce a media variable's raw value (string or MediaRef-shaped object) to its stored string form. */
export function readMediaVariableValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.file_id === "string") return o.file_id;
    if (typeof o.fileId === "string") return o.fileId;
    if (typeof o.resource_id === "string") return o.resource_id;
    if (typeof o.url === "string") return o.url;
  }
  return "";
}

/** The cld_files file_id when the value names a library file, else null (a URL or empty). */
export function readMediaVariableFileId(value: unknown): string | null {
  const stored = readMediaVariableValue(value);
  return stored && isMediaFileId(stored) ? stored : null;
}
