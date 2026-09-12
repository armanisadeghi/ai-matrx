import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import {
  orchestratorJsonHeaders,
  resolvePersistedOrchestrator,
} from "@/lib/sandbox/orchestrator-routing";

async function verifyAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user)
      return {
        error: NextResponse.json(
          { error: "User not authenticated" },
          { status: 401 },
        ),
      };
    if (!(await checkIsSuperAdmin(supabase, user.id)))
      return {
        error: NextResponse.json(
          { error: "Admin access required" },
          { status: 403 },
        ),
      };
    return { error: null };
  } catch {
    return {
      error: NextResponse.json(
        { error: "Unable to verify admin access" },
        { status: 500 },
      ),
    };
  }
}
async function load(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sandbox_instances")
    .select("*")
    .is("deleted_at", null)
    .eq("id", id)
    .single();
  if (error || !data) {
    if (error?.code === "PGRST116") {
      return {
        error: NextResponse.json(
          { error: "Sandbox instance not found" },
          { status: 404 },
        ),
      };
    }
    return {
      error: NextResponse.json(
        { error: "Failed to read sandbox instance" },
        { status: 500 },
      ),
    };
  }
  const resolved = resolvePersistedOrchestrator(data.tier, data.config);
  if (!resolved.ok)
    return {
      error: NextResponse.json({ error: resolved.error }, { status: 409 }),
    };
  return { admin, data, target: resolved.orchestrator, error: null };
}

async function loadForRead(id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sandbox_instances")
    .select("*")
    .is("deleted_at", null)
    .eq("id", id)
    .single();
  if (!error && data) return { data, error: null };
  if (error?.code === "PGRST116") {
    return {
      error: NextResponse.json(
        { error: "Sandbox instance not found" },
        { status: 404 },
      ),
    };
  }
  return {
    error: NextResponse.json(
      { error: "Failed to read sandbox instance" },
      { status: 500 },
    ),
  };
}
async function call(url: string, options: RequestInit) {
  try {
    return await fetch(url, options);
  } catch {
    return null;
  }
}
function failed(status: number) {
  return NextResponse.json(
    { error: "Sandbox orchestrator request failed" },
    { status: status >= 500 ? 502 : status },
  );
}
function upstreamExpiry(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value =
    (payload as Record<string, unknown>).new_expires_at ??
    (payload as Record<string, unknown>).expires_at;
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifyAdmin(await createClient());
  if (session.error) return session.error;
  const item = await loadForRead((await params).id);
  if (item.error) return item.error;
  return NextResponse.json({ instance: item.data });
}
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifyAdmin(await createClient());
  if (session.error) return session.error;
  const id = (await params).id;
  const body = await request.json().catch(() => null);
  if (body?.action !== "stop" && body?.action !== "extend")
    return NextResponse.json(
      { error: "Invalid action. Supported: stop, extend" },
      { status: 400 },
    );
  const item = await load(id);
  if (item.error) return item.error;
  if (body.action === "stop") {
    const response = await call(
      `${item.target.url}/sandboxes/${item.data.sandbox_id}?graceful=true`,
      { method: "DELETE", headers: orchestratorJsonHeaders(item.target) },
    );
    if (!response)
      return NextResponse.json(
        { error: "Sandbox orchestrator is not reachable" },
        { status: 502 },
      );
    if (!response.ok) return failed(response.status);
    const fresh = await load(id);
    if (fresh.error || fresh.data.status !== "stopped")
      return NextResponse.json(
        { error: "Sandbox stopped but persisted state could not be verified" },
        { status: 502 },
      );
    return NextResponse.json({ instance: fresh.data });
  }
  if (item.data.expires_at == null)
    return NextResponse.json(
      { error: "Sandbox has no finite expiry to extend" },
      { status: 409 },
    );
  const seconds = Number(body.ttl_seconds ?? 3600);
  if (!Number.isInteger(seconds) || seconds < 60 || seconds > 86400)
    return NextResponse.json(
      { error: "ttl_seconds must be an integer between 60 and 86400" },
      { status: 400 },
    );
  const response = await call(
    `${item.target.url}/sandboxes/${item.data.sandbox_id}/extend`,
    {
      method: "POST",
      headers: orchestratorJsonHeaders(item.target),
      body: JSON.stringify({ ttl_seconds: seconds }),
    },
  );
  if (!response)
    return NextResponse.json(
      { error: "Sandbox orchestrator is not reachable" },
      { status: 502 },
    );
  if (!response.ok) return failed(response.status);
  const payload: unknown = await response.json().catch(() => null);
  const expiry = upstreamExpiry(payload);
  const fresh = await load(id);
  if (
    !expiry ||
    fresh.error ||
    fresh.data.expires_at == null ||
    Date.parse(fresh.data.expires_at) !== Date.parse(expiry)
  )
    return NextResponse.json(
      { error: "Sandbox extended but persisted expiry could not be verified" },
      { status: 502 },
    );
  return NextResponse.json({ instance: fresh.data });
}
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifyAdmin(await createClient());
  if (session.error) return session.error;
  const id = (await params).id;
  const item = await load(id);
  if (item.error) return item.error;
  const response = await call(
    `${item.target.url}/sandboxes/${item.data.sandbox_id}?graceful=true&purge=true`,
    { method: "DELETE", headers: orchestratorJsonHeaders(item.target) },
  );
  if (!response)
    return NextResponse.json(
      { error: "Sandbox orchestrator is not reachable" },
      { status: 502 },
    );
  if (!response.ok) return failed(response.status);
  const { data: stillLive, error } = await item.admin
    .from("sandbox_instances")
    .select("id")
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();
  if (error || stillLive)
    return NextResponse.json(
      { error: "Sandbox deleted but persisted deletion could not be verified" },
      { status: 502 },
    );
  return new NextResponse(null, { status: 204 });
}
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await verifyAdmin(await createClient());
  if (session.error) return session.error;
  const item = await load((await params).id);
  if (item.error) return item.error;
  if (!["ready", "running"].includes(item.data.status))
    return NextResponse.json(
      { error: `Sandbox is not running (status: ${item.data.status})` },
      { status: 409 },
    );
  const response = await call(
    `${item.target.url}/sandboxes/${item.data.sandbox_id}/access`,
    { method: "POST", headers: orchestratorJsonHeaders(item.target) },
  );
  if (!response)
    return NextResponse.json(
      { error: "Sandbox orchestrator is not reachable" },
      { status: 502 },
    );
  if (!response.ok) return failed(response.status);
  return NextResponse.json(await response.json());
}
