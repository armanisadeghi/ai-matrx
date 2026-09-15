import { NextRequest, NextResponse } from "next/server";
import { resolveSandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";
import { proxyLifecycleReceipt } from "@/lib/sandbox/lifecycle-route-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; operationId: string }> }) {
  const { id, operationId } = await params;
  const kind = request.nextUrl.searchParams.get("kind");
  const gracefulParam = request.nextUrl.searchParams.get("graceful");
  if (kind !== "stop" && kind !== "delete") return NextResponse.json({ error: "lifecycle kind is required" }, { status: 400 });
  if (gracefulParam !== "true" && gracefulParam !== "false") return NextResponse.json({ error: "boolean graceful intent is required" }, { status: 400 });
  const resolved = await resolveSandboxLifecycleTarget(id);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  return proxyLifecycleReceipt(resolved.target, `/${operationId}`, { method: "GET" }, { operation_id: operationId, kind, graceful: gracefulParam === "true" });
}
