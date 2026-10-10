// features/scopes/service/associationResult.ts
//
// Host services that answer `RecordsResult` (the host's rpcResult builders
// speak the records error vocabulary), but they ride the associations chokepoint, which answers
// `AssociationsRpcResult`. This is the ONE place an association refusal becomes a records refusal —
// the message, hint and detail are carried verbatim; only the code word changes.

import type { AssociationsRpcError, AssociationsRpcErrorCode, AssociationsRpcResult } from "@ai-matrx/associations";
import type { RecordsError, RecordsErrorCode, RecordsResult } from "@ai-matrx/records";

const CODE: Record<AssociationsRpcErrorCode, RecordsErrorCode> = {
  unauthorized: "door",
  forbidden_org: "door",
  forbidden_role: "door",
  not_found: "not_found",
  conflict_in_use: "refused_by_rule",
  invalid_argument: "invalid_argument",
  version_conflict: "stale_write",
  quota_exceeded: "store_limit",
  demanded_schema_violation: "door_absent",
  internal: "internal",
};

/** An association refusal, in the records vocabulary. */
export function associationRefusal(e: AssociationsRpcError): RecordsError {
  const { code, message, hint, detail } = e;
  return { code: CODE[code], message, hint, detail };
}

export function fromAssociations<T>(res: AssociationsRpcResult<T>): RecordsResult<T> {
  if (res.ok === true) return { ok: true, data: res.data };
  return { ok: false, error: associationRefusal(res.error) };
}
