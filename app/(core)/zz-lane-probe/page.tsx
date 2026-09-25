// TEMPORARY lane probe — deleted in the same session.
import { headers } from "next/headers";
import { createClient } from "@/utils/supabase/server";
export const dynamic = "force-dynamic";
export default async function Page() {
  const h = await headers();
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_lane_open");
  return <pre id="probe">{JSON.stringify({ header: h.get("x-matrx-admin-lane"), lane: data, error: error?.message ?? null })}</pre>;
}
