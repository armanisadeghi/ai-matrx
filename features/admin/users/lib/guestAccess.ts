/**
 * Guest access state — pure, safe for server routes and client components.
 *
 * ONE rule, the same one aidream's guest resolver
 * (`matrx_ai.db._guest_registry_impl.resolve_guest_uuid`) and
 * `public.check_guest_execution_limit` enforce: a guest registry row blocks
 * while `is_blocked` is true and `blocked_until` is unset or still in the
 * future. The only writer is `public.admin_set_guest_block` (see guestBlock.ts).
 */

import { z } from "zod";
import type { Database } from "@/types/database.types";

type GuestRow = Database["users"]["Tables"]["guest_executions"]["Row"];

export const GuestAccessSchema = z.object({
  guest_id: z.string().uuid(),
  /** The raw flag — true even when the block's end time has passed. */
  is_blocked: z.boolean(),
  /** What aidream enforces right now. */
  block_active: z.boolean(),
  blocked_until: z.string().nullable(),
  blocked_reason: z.string().nullable(),
});

export type GuestAccess = z.infer<typeof GuestAccessSchema>;

export type GuestAccessState = "allowed" | "blocked" | "block_expired";

/** Project a guest registry row onto its access state, as aidream enforces it. */
export function guestAccessFromRow(
  row: Pick<GuestRow, "id" | "is_blocked" | "blocked_until" | "blocked_reason">,
  now: Date = new Date(),
): GuestAccess {
  const isBlocked = row.is_blocked === true;
  const until = row.blocked_until ? Date.parse(row.blocked_until) : null;
  return {
    guest_id: row.id,
    is_blocked: isBlocked,
    block_active: isBlocked && (until === null || until > now.getTime()),
    blocked_until: row.blocked_until,
    blocked_reason: row.blocked_reason,
  };
}

export function guestAccessState(access: GuestAccess): GuestAccessState {
  if (access.block_active) return "blocked";
  return access.is_blocked ? "block_expired" : "allowed";
}
