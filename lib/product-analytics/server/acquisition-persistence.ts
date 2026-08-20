import "server-only";

import { createAdminClient } from "@/utils/supabase/adminClient";
import type { FirstTouchPayload } from "../user-acquisition";

interface RecordFirstTouchInput {
  payload: FirstTouchPayload;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId?: string | null;
}

/** Atomic first-touch persistence. The database preserves the first observed
 * values while later calls enrich missing browser and identity fields. */
export async function recordAcquisitionFirstTouch({
  payload,
  ipAddress = null,
  userAgent = null,
  userId = null,
}: RecordFirstTouchInput): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("record_acquisition_first_touch", {
    p_visitor_id: payload.fingerprint,
    p_acquisition: payload,
    p_ip_address: ipAddress ?? undefined,
    p_user_agent: userAgent ?? undefined,
    p_guest_fingerprint: payload.guest_fingerprint ?? undefined,
    p_user_id: userId ?? undefined,
  });
  if (error) throw error;
  return data;
}

/** Attach a permanent account to the visitor's first-touch record even when
 * the visitor never created an anonymous AI execution. */
export async function linkAcquisitionToUser(
  visitorId: string | null | undefined,
  userId: string,
): Promise<void> {
  if (!visitorId) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("record_acquisition_first_touch", {
    p_visitor_id: visitorId,
    p_user_id: userId,
  });
  if (error) throw error;
}
