import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import * as Api from "@/features/files/api";
import { folderForAgentApp } from "@/features/files";

const FAVICON_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#6366f1",
  "#a855f7",
  "#f43f5e",
  "#0ea5e9",
  "#84cc16",
  "#d946ef",
];

function getColorFromString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return FAVICON_COLORS[Math.abs(hash) % FAVICON_COLORS.length];
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "A";
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function generateFaviconSVG(color: string, initials: string): string {
  const fontSize = initials.length === 1 ? 48 : initials.length === 2 ? 36 : 28;
  const yPosition = initials.length === 1 ? 56 : 54;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="${color}" rx="12"/>
  <text x="32" y="${yPosition}" font-family="system-ui,-apple-system,sans-serif" font-size="${fontSize}" font-weight="700" fill="white" text-anchor="middle">${initials}</text>
</svg>`;
}

function resolveAppOrigin(req: NextRequest): string {
  // Prefer the incoming request's origin so share URLs are always correct
  // behind preview deploys, custom domains, etc. Fall back to env.
  const origin = req.nextUrl.origin;
  if (origin) return origin;
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "http://localhost:3000")
  );
}

export async function POST(request: NextRequest) {
  try {
    // The `agent_apps` table isn't in the generated Database types yet; the
    // original route used an `as unknown as any` escape hatch — preserved
    // here until the types regenerate.
    const supabase = (await createClient()) as unknown as any;
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { appId, name, color } = body as {
      appId: string;
      name: string;
      color?: string;
    };

    if (!appId || !name) {
      return NextResponse.json(
        { success: false, error: "appId and name are required" },
        { status: 400 },
      );
    }

    // Admin client for the ownership check + the agent_apps row update. The
    // favicon BYTES now live in cloud-files under `Agent Apps/{appId}/` —
    // uploaded via the user's session so RLS + ownership line up correctly.
    const adminClient = createAdminClient() as unknown as any;
    const { data: app, error: appError } = await adminClient
      .schema("app")
      .from("definition")
      .select("id, user_id")
      .eq("id", appId)
      .single();

    if (appError || !app) {
      return NextResponse.json(
        { success: false, error: "App not found" },
        { status: 404 },
      );
    }

    if (app.user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "You do not own this app" },
        { status: 403 },
      );
    }

    const faviconColor = color || getColorFromString(name);
    const initials = getInitials(name);
    const svg = generateFaviconSVG(faviconColor, initials);
    const svgBytes = new TextEncoder().encode(svg);

    // Upload to cloud-files under `Agent Apps/{appId}/favicon.svg` AND
    // create a persistent share link so the URL we persist into the DB row
    // doesn't expire. Using the session JWT keeps RLS honest — the file is
    // owned by the user, which means they can see it in their Files app.
    const ctx = Api.Server.createServerContext({
      accessToken: session.access_token,
    });

    const { fileId, shareUrl } = await Api.Server.uploadAndShare(ctx, {
      file: svgBytes,
      filePath: `${folderForAgentApp(appId)}/favicon.svg`,
      fileName: "favicon.svg",
      contentType: "image/svg+xml",
      visibility: "private",
      permissionLevel: "read",
      metadata: {
        origin: "agent-app-favicon",
        agent_app_id: appId,
      },
      appOrigin: resolveAppOrigin(request),
    });

    const { error: updateError } = await adminClient
      .schema("app")
      .from("definition")
      .update({ favicon_url: shareUrl })
      .eq("id", appId);

    if (updateError) {
      console.error("Favicon URL update error:", updateError);
    }

    return NextResponse.json({
      success: true,
      faviconUrl: shareUrl,
      faviconFileId: fileId,
      color: faviconColor,
      initials,
    });
  } catch (error) {
    console.error("Generate favicon error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
