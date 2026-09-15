import { NextRequest, NextResponse } from "next/server";
import { resolveSandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";
import { proxyLifecycleReceipt } from "@/lib/sandbox/lifecycle-route-proxy";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; operationId: string }> }) {
  const { id, operationId } = await params;
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "stop" && kind !== "delete") return NextResponse.json({ error: "lifecycle kind is required" }, { status: 400 });
  const resolved = await resolveSandboxLifecycleTarget(id);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  return proxyLifecycleReceipt(resolved.target, `/${operationId}/recover`, { method: "POST" }, { operation_id: operationId, kind });
}
