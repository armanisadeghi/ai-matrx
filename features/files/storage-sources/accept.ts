import { resolveMime } from "@/features/files/utils/mime";
import { extname } from "@/features/files/utils/path";

export interface StorageAcceptResult {
  accepted: boolean;
  mimeType: string | null;
  reason: string | null;
}

function acceptTokens(accept?: string): string[] {
  return (accept ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** One acceptance rule shared by local input, Google Picker, and provider browse. */
export function matchStorageAccept(
  name: string,
  explicitMime: string | null | undefined,
  accept?: string,
): StorageAcceptResult {
  const tokens = acceptTokens(accept);
  const resolved = resolveMime(explicitMime, name);
  const mimeType = resolved && resolved !== "application/octet-stream" ? resolved : null;
  if (!tokens.length) return { accepted: true, mimeType, reason: null };

  const extension = extname(name);
  const accepted = tokens.some((token) => {
    if (token.startsWith(".")) return extension === token.slice(1);
    if (!mimeType) return false;
    if (token.endsWith("/*")) return mimeType.startsWith(token.slice(0, -1));
    return mimeType === token;
  });
  return {
    accepted,
    mimeType,
    reason: accepted
      ? null
      : mimeType
        ? `${name} does not match the allowed file types.`
        : `${name} has an unknown file type and cannot be selected here.`,
  };
}

export function enforceStorageSelectionMode<T>(
  values: readonly T[],
  multiple: boolean,
): { accepted: true; values: T[] } | { accepted: false; reason: string } {
  if (!multiple && values.length > 1) {
    return { accepted: false, reason: "Select one file." };
  }
  return { accepted: true, values: [...values] };
}
