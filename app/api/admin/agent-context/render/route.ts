import { NextRequest, NextResponse } from "next/server";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { getBackendProxyAuthHeaders } from "@/lib/api/proxy-backend-auth-headers";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RENDER_PATH = "/admin/agent-context/render";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const resolvedStatus = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : status;
  return NextResponse.json({ error: message }, { status: resolvedStatus });
}

function resolveAidreamUrl(): string {
  const baseUrl = process.env.AIDREAM_API_URL ?? AIDREAM_PRODUCTION_URL;
  return `${baseUrl.replace(/\/$/, "")}${RENDER_PATH}`;
}

function isRenderRequest(value: unknown): value is {
  target: Record<string, unknown>;
  invocation: Record<string, unknown>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (
    !!body.target &&
    typeof body.target === "object" &&
    !Array.isArray(body.target) &&
    !!body.invocation &&
    typeof body.invocation === "object" &&
    !Array.isArray(body.invocation)
  );
}

/**
 * Same-origin super-admin proxy for the canonical aidream context renderer.
 *
 * The body is parsed only to reject malformed requests, then forwarded as the
 * exact incoming text. The backend response stream is returned untouched so
 * the inspector can display the renderer's actual output rather than a
 * re-serialized approximation.
 */
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    return errorResponse(error);
  }

  const rawBody = await request.text();
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (!isRenderRequest(parsedBody)) {
    return NextResponse.json(
      {
        error:
          "Request body must contain object-shaped target and invocation fields.",
      },
      { status: 400 },
    );
  }

  const renderUrl = resolveAidreamUrl();

  try {
    const backendHeaders = getBackendProxyAuthHeaders(request, {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
    });

    // Same-origin browser calls authenticate through Supabase cookies, not an
    // Authorization header. Forward the current session to aidream so it sees
    // the same caller identity as a normal agent request.
    if (!backendHeaders.Authorization) {
      const supabase = await createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        backendHeaders.Authorization = `Bearer ${session.access_token}`;
      }
    }

    const upstream = await fetch(renderUrl, {
      method: "POST",
      headers: backendHeaders,
      body: rawBody,
      cache: "no-store",
    });

    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    headers.set("cache-control", "no-store");
    headers.set("x-context-inspector-upstream-status", String(upstream.status));

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch (error) {
    return errorResponse(error, 502);
  }
}
