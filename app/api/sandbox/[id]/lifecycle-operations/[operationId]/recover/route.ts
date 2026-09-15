import { NextRequest, NextResponse } from "next/server";
import { resolveSandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";
import { proxyLifecycleReceipt } from "@/lib/sandbox/lifecycle-route-proxy";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";

async function mayForceStop(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    return !error && !!user && await checkIsSuperAdmin(supabase, user.id);
  } catch { return false; }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; operationId: string }> }) {
  const { id, operationId } = await params;
  const kind = request.nextUrl.searchParams.get("kind");
  const body: unknown = await request.json().catch(() => null);
  if (kind !== "stop" && kind !== "delete") return NextResponse.json({ error: "lifecycle kind is required" }, { status: 400 });
  if (!body || typeof body !== "object" || (body as { graceful?: unknown }).graceful !== undefined && typeof (body as { graceful?: unknown }).graceful !== "boolean") return NextResponse.json({ error: "boolean graceful intent is required" }, { status: 400 });
  const graceful = (body as { graceful?: boolean }).graceful ?? true;
  if (!graceful && !await mayForceStop()) return NextResponse.json({ error: "Super-admin access required for force stop" }, { status: 403 });
  const resolved = await resolveSandboxLifecycleTarget(id);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  return proxyLifecycleReceipt(resolved.target, `/${operationId}/recover`, { method: "POST", body: JSON.stringify({ graceful }) }, { operation_id: operationId, kind, graceful });
}
