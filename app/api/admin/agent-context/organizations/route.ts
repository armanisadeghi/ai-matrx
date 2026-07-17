import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URLS } from "@/lib/api/endpoints";
import { getBackendProxyAuthHeaders } from "@/lib/api/proxy-backend-auth-headers";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORGANIZATIONS_PATH = "/admin/agent-context/organizations";

function errorResponse(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const resolvedStatus = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : status;
  return NextResponse.json({ error: message }, { status: resolvedStatus });
}

function resolveAidreamUrl(): string | null {
  const baseUrl =
    process.env.AIDREAM_API_URL ??
    BACKEND_URLS.production ??
    process.env.NEXT_PUBLIC_BACKEND_URL;
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${ORGANIZATIONS_PATH}` : null;
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (error) {
    return errorResponse(error);
  }

  const organizationsUrl = resolveAidreamUrl();
  if (!organizationsUrl) {
    return NextResponse.json(
      { error: "Aidream is not configured." },
      { status: 503 },
    );
  }

  try {
    const headers = getBackendProxyAuthHeaders(request, {
      Accept: "application/json",
    });
    if (!headers.Authorization) {
      const supabase = await createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    }
    const upstream = await fetch(organizationsUrl, {
      headers,
      cache: "no-store",
    });
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: {
        "cache-control": "no-store",
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    return errorResponse(error, 502);
  }
}
