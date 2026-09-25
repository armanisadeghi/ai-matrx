import { NextRequest, NextResponse } from "next/server";
import { hasAdminPower } from "@/utils/auth/adminLaneServer";
import { resolveSandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";
import { proxyLifecycleReceipt, readExactLifecycleReceipt } from "@/lib/sandbox/lifecycle-route-proxy";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

async function mayForceStop(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await getClaimsUser(supabase);
    return !error && !!user && await hasAdminPower(supabase, user.id);
  } catch { return false; }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; operationId: string }> }) {
  const { id, operationId } = await params;
  const kind = request.nextUrl.searchParams.get("kind");
  const body: unknown = await request.json().catch(() => null);
  if (kind !== "stop" && kind !== "delete") return NextResponse.json({ error: "lifecycle kind is required" }, { status: 400 });
  if (!body || typeof body !== "object" || (body as { graceful?: unknown }).graceful !== undefined && typeof (body as { graceful?: unknown }).graceful !== "boolean") return NextResponse.json({ error: "boolean graceful intent is required" }, { status: 400 });
  const resolved = await resolveSandboxLifecycleTarget(id);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const stored = await readExactLifecycleReceipt(resolved.target, operationId, kind);
  if (!stored) return NextResponse.json({ error: "Sandbox lifecycle receipt unavailable" }, { status: 409 });
  const callerGraceful = (body as { graceful?: boolean }).graceful;
  if (callerGraceful !== undefined && callerGraceful !== stored.graceful) return NextResponse.json({ error: "Sandbox lifecycle intent does not match the stored receipt" }, { status: 409 });
  if (!stored.graceful && !await mayForceStop()) return NextResponse.json({ error: "Super-admin access required for force stop" }, { status: 403 });
  const graceful = stored.graceful;
  return proxyLifecycleReceipt(resolved.target, `/${operationId}/recover`, { method: "POST", body: JSON.stringify({ graceful }) }, { operation_id: operationId, kind, graceful });
}
