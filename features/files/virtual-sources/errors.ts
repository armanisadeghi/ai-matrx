/**
 * features/files/virtual-sources/errors.ts
 *
 * Errors raised by virtual source adapters. We re-export `RemoteConflictError`
 * from the older `LibrarySourceAdapter` package so callers can catch the same
 * type regardless of which contract the adapter implements.
 */

import { RemoteConflictError } from "@/features/code/library-sources/types";

/** Raised when a caller asks an adapter to perform an operation it doesn't
 *  support — e.g. renaming a Tool UI component (admin asset, no rename). The
 *  UI typically catches this and shows a "not supported" toast. */
export class VirtualSourceError extends Error {
  readonly isVirtualSourceError = true;
  constructor(
    public readonly code:
      | "not_supported"
      | "not_found"
      | "forbidden"
      | "validation"
      | "internal",
    public readonly operation:
      | "list"
      | "read"
      | "write"
      | "rename"
      | "move"
      | "delete"
      | "create"
      | "list_versions"
      | "restore_version",
    message?: string,
  ) {
    super(
      message ?? `Virtual source error: ${code} during ${operation}`,
    );
  }
}

export function isVirtualSourceError(err: unknown): err is VirtualSourceError {
  return Boolean(err) && (err as VirtualSourceError)?.isVirtualSourceError === true;
}

export { RemoteConflictError };
export { isRemoteConflictError } from "@/features/code/library-sources/types";
