// TEMPORARY lane probe — deleted in the same session.
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
export async function GET() {
  const h = await headers();
  const sb = await createClient();
  const { data, error } = await sb.rpc("admin_lane_open");
  const who = (await sb.auth.getUser()).data.user?.email ?? null;
  return NextResponse.json({ who, header: h.get("x-matrx-admin-lane"), lane: data, error: error?.message ?? null });
}
