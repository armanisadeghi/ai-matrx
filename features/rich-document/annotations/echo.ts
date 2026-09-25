// features/rich-document/annotations/echo.ts
//
// OWN-ECHO RECOGNITION BY WRITE IDENTITY, never by a time window (supabase-realtime skill,
// Rule 1; verify-RC-B11 F6: a 5-second "my user id" window dropped the SAME person's other
// tab's edits). A tab records exactly the writes it made:
//   - a create by the client request id it minted (the row carries client_request_id);
//   - an edit by the (comment id, version) the door returned for that write;
//   - a delete by the comment id it deleted.
// An event matching none of those is somebody else's — including this person's other tab —
// and is delivered. A row without those fields (the door not yet applied) is always delivered.

export interface EchoLedger {
  createdRequestIds: Set<string>;
  writtenVersions: Map<string, number>;
  deletedIds: Set<string>;
}

export function createEchoLedger(): EchoLedger {
  return { createdRequestIds: new Set(), writtenVersions: new Map(), deletedIds: new Set() };
}

export interface CommentEchoRow {
  id?: unknown;
  client_request_id?: unknown;
  version?: unknown;
  deleted_at?: unknown;
}

export function isOwnEcho(
  event: "INSERT" | "UPDATE" | "DELETE" | string,
  row: CommentEchoRow | null | undefined,
  ledger: EchoLedger,
): boolean {
  if (!row || typeof row.id !== "string") return false;
  if (event === "INSERT") {
    return typeof row.client_request_id === "string" && ledger.createdRequestIds.has(row.client_request_id);
  }
  if (event === "UPDATE") {
    if (row.deleted_at) return ledger.deletedIds.has(row.id);
    const mine = ledger.writtenVersions.get(row.id);
    return typeof row.version === "number" && mine === row.version;
  }
  return false;
}
