// features/admin/shared/admin-rpc-errors.ts
//
// Shared error interpretation for the super-admin SECURITY DEFINER RPC
// families (admin_update_app_config, admin_upsert_catalog_entry, ...).
// All of them raise 42501 for non-super-admins and 40001 ("Conflict: ...")
// for optimistic-concurrency failures.

export interface AdminRpcError {
  code?: string;
  message: string;
}

export function rpcErrorMessage(error: AdminRpcError): string {
  if (error.code === "42501") {
    return "Super Admin required — your account cannot perform this write.";
  }
  return error.message;
}

/** ERRCODE 40001 ("Conflict: …") raised when the row changed since it was
 *  loaded (optimistic-concurrency check on p_expected_updated_at). */
export function isConflictError(error: AdminRpcError): boolean {
  return error.code === "40001" || error.message.startsWith("Conflict:");
}
