import { NextRequest, NextResponse } from "next/server";
import { resolveSandboxLifecycleTarget } from "@/lib/sandbox/lifecycle-target";
import { hasExactLifecycleReceipt, proxyLifecycleReceipt, validLifecycleRequest } from "@/lib/sandbox/lifecycle-route-proxy";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const body: unknown = await request.json().catch(() => null);
  if (!validLifecycleRequest(body)) return NextResponse.json({ error: "operation_id and lifecycle kind are required" }, { status: 400 });
  const resolved = await resolveSandboxLifecycleTarget((await params).id);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  if (resolved.target.deletedAt && !await hasExactLifecycleReceipt(resolved.target, body.operation_id, body.kind)) return NextResponse.json({ error: "Sandbox lifecycle target unavailable" }, { status: 404 });
  return proxyLifecycleReceipt(resolved.target, "", { method: "POST", body: JSON.stringify({ operation_id: body.operation_id, kind: body.kind }) }, body);
}
