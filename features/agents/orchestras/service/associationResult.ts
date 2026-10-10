// features/agents/orchestras/service/associationResult.ts
//
// The orchestra / org-chart / purpose services answer `RecordsResult` (the host's rpcResult builders
// speak the records error vocabulary), but they ride the associations chokepoint, which answers
// `AssociationsRpcResult`. This is the ONE place an association refusal becomes a records refusal —
// the message, hint and detail are carried verbatim; only the code word changes.

import type { AssociationsRpcErrorCode, AssociationsRpcResult } from "@ai-matrx/associations";
import type { RecordsErrorCode, RecordsResult } from "@ai-matrx/records";

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

export function fromAssociations<T>(res: AssociationsRpcResult<T>): RecordsResult<T> {
  if (res.ok === true) return { ok: true, data: res.data };
  const { code, message, hint, detail } = res.error;
  return { ok: false, error: { code: CODE[code], message, hint, detail } };
}
