/**
 * Guest blocking — the client half of `public.admin_set_guest_block`.
 *
 * The database is the authority: the RPC refuses anyone who is not a super
 * admin (42501), refuses a block whose end time is not in the future (22023),
 * and is the only writer of `is_blocked` / `blocked_until` / `blocked_reason`.
 * aidream's guest resolver and `check_guest_execution_limit` read those same
 * three columns with ONE rule, mirrored in `guestAccessFromRow` below: a block
 * holds while `blocked_until` is unset or still in the future.
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import type { Database } from "@/types/database.types";
import { GuestAccessSchema, type GuestAccess } from "./guestAccess";

const RpcResultSchema = GuestAccessSchema.extend({
  updated_at: z.string().nullable(),
});

export type GuestBlockErrorCode = "forbidden" | "not_found" | "invalid" | "failed";

export class GuestBlockError extends Error {
  constructor(
    readonly code: GuestBlockErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GuestBlockError";
  }
}

function codeFor(pgCode: string | undefined): GuestBlockErrorCode {
  if (pgCode === "42501") return "forbidden";
  if (pgCode === "P0002") return "not_found";
  if (pgCode === "22023" || pgCode === "22001") return "invalid";
  return "failed";
}

async function setGuestBlock(
  client: SupabaseClient<Database>,
  args: {
    guestId: string;
    blocked: boolean;
    reason?: string | null;
    blockedUntil?: string | null;
  },
): Promise<GuestAccess> {
  const { data, error } = await client.rpc("admin_set_guest_block", {
    p_guest_id: args.guestId,
    p_blocked: args.blocked,
    p_reason: args.reason ?? undefined,
    p_blocked_until: args.blockedUntil ?? undefined,
  });
  if (error) {
    throw new GuestBlockError(codeFor(error.code), error.message);
  }
  const parsed = RpcResultSchema.safeParse(data);
  if (!parsed.success) {
    throw new GuestBlockError(
      "failed",
      "The block was written but the database returned an unreadable state; reload to see the current state.",
    );
  }
  const { updated_at: _updatedAt, ...access } = parsed.data;
  return access;
}

/** Block a guest. `blockedUntil` null = until a super admin unblocks it. */
export function blockGuest(
  args: { guestId: string; reason: string | null; blockedUntil: string | null },
  client: SupabaseClient<Database> = supabase,
): Promise<GuestAccess> {
  return setGuestBlock(client, { ...args, blocked: true });
}

export function unblockGuest(
  args: { guestId: string },
  client: SupabaseClient<Database> = supabase,
): Promise<GuestAccess> {
  return setGuestBlock(client, { guestId: args.guestId, blocked: false });
}
