/**
 * The ONE line the directive builder says after a run — from the receipts'
 * own statuses, never from the bare `applied` count.
 *
 * WHY (reviewer, 2026-10-02): a repeat Create — which the ledger deduped, so
 * nothing was written — said "Applied 1 item(s)". The server counts a replayed
 * item as applied; its receipt says `already_applied`. Only the receipts know.
 */

import type { DirectiveApplyResult } from "@/features/directive-catalog/types";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function executeResultHeadline(result: DirectiveApplyResult): string {
  const receipts = result.receipts ?? [];
  const by = (status: string) => receipts.filter((r) => r.status === status).length;
  const applied = by("applied");
  const already = by("already_applied");
  const failed = by("failed");
  const notBuilt = by("not_implemented");

  if (receipts.length === 0) {
    return result.failed > 0 ? `${count(result.failed, "item", "items")} failed.` : "Nothing was written.";
  }
  if (already === receipts.length) return "Already applied — nothing new was written.";
  if (applied === receipts.length) return receipts.length === 1 ? "Applied." : `Applied ${receipts.length} items.`;
  if (failed === receipts.length) return receipts.length === 1 ? "Failed — nothing was written." : `All ${receipts.length} failed.`;
  const parts: string[] = [];
  if (applied) parts.push(`${applied} applied`);
  if (already) parts.push(`${already} already applied`);
  if (notBuilt) parts.push(`${notBuilt} not built yet`);
  if (failed) parts.push(`${failed} failed`);
  const line = parts.join(", ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}
