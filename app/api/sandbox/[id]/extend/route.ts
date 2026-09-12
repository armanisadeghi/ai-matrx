import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  lookupSandboxAndOrchestrator,
  orchestratorJsonHeaders,
} from "@/lib/sandbox/orchestrator-routing";
import { decorateSandboxRow } from "@/lib/sandbox/decorate-sandbox-row";

function upstreamExpiry(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value =
    (payload as Record<string, unknown>).new_expires_at ??
    (payload as Record<string, unknown>).expires_at;
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function sameInstant(left: string, right: string) {
  return Date.parse(left) === Date.parse(right);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = (await params).id;
  const lookup = await lookupSandboxAndOrchestrator(id);
  if (!lookup.ok)
    return NextResponse.json(
      { error: lookup.error },
      { status: lookup.status },
    );
  const body = await request.json().catch(() => ({}));
  const seconds = Number(body?.ttl_seconds ?? 3600);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400)
    return NextResponse.json(
      { error: "ttl_seconds must be an integer between 60 and 86400" },
      { status: 400 },
    );
  const supabase = await createClient();
  const { data: before, error: beforeError } = await supabase
    .from("sandbox_instances")
    .select("expires_at")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (beforeError || !before)
    return NextResponse.json(
      { error: "Sandbox instance not found" },
      { status: 404 },
    );
  if (before.expires_at == null)
    return NextResponse.json(
      { error: "Sandbox has no finite expiry to extend" },
      { status: 409 },
    );
  let response: Response;
  try {
    response = await fetch(
      `${lookup.orchestrator.url}/sandboxes/${lookup.sandboxId}/extend`,
      {
        method: "POST",
        headers: orchestratorJsonHeaders(lookup.orchestrator),
        body: JSON.stringify({ ttl_seconds: seconds }),
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Sandbox orchestrator is not reachable" },
      { status: 502 },
    );
  }
  if (!response.ok)
    return NextResponse.json(
      { error: "Sandbox orchestrator request failed" },
      { status: response.status >= 500 ? 502 : response.status },
    );
  const payload: unknown = await response.json().catch(() => null);
  const expiry = upstreamExpiry(payload);
  if (!expiry)
    return NextResponse.json(
      { error: "Sandbox orchestrator returned no expiry" },
      { status: 502 },
    );
  const { data: fresh, error: freshError } = await supabase
    .from("sandbox_instances")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (
    freshError ||
    !fresh ||
    fresh.expires_at == null ||
    !sameInstant(fresh.expires_at, expiry)
  )
    return NextResponse.json(
      { error: "Sandbox extended but persisted expiry could not be verified" },
      { status: 502 },
    );
  return NextResponse.json({
    instance: decorateSandboxRow(fresh),
    orchestrator: payload,
  });
}
