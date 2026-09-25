import { NextRequest, NextResponse } from "next/server";
import { hasAdminPower } from "@/utils/auth/adminLaneServer";
import { resolveSandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";
import { hasExactLifecycleReceipt, proxyLifecycleReceipt, validLifecycleRequest } from "@/lib/sandbox/lifecycle-route-proxy";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

async function mayForceStop(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await getClaimsUser(supabase);
    return !error && !!user && await hasAdminPower(supabase, user.id);
  } catch { return false; }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json().catch(() => null);
  if (!validLifecycleRequest(body)) return NextResponse.json({ error: "operation_id, lifecycle kind, and boolean graceful intent are required" }, { status: 400 });
  const graceful = body.graceful ?? true;
  if (!graceful && !await mayForceStop()) return NextResponse.json({ error: "Super-admin access required for force stop" }, { status: 403 });
  const resolved = await resolveSandboxLifecycleTarget((await params).id);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (resolved.target.deletedAt && !await hasExactLifecycleReceipt(resolved.target, body.operation_id, body.kind)) return NextResponse.json({ error: "Sandbox lifecycle target unavailable" }, { status: 404 });
  return proxyLifecycleReceipt(resolved.target, "", { method: "POST", body: JSON.stringify({ operation_id: body.operation_id, kind: body.kind, graceful }) }, { ...body, graceful });
}
