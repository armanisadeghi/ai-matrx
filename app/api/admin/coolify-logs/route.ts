import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

const COOLIFY_API_URL =
  process.env.COOLIFY_API_URL ?? "https://coolify.app.matrxserver.com/api/v1";
const COOLIFY_API_TOKEN = process.env.COOLIFY_API_TOKEN ?? "";

const APP_UUIDS: Record<string, string> = {
  "ai-dream-server": "j4sos40wkgk0cw8w00k8owcw",
  "ai-dream-server-dev": "w8k0wscowgwkc8kwswo48cgw",
  "scraper-service": "yowos4cggg88kw0wwokw0s08",
  "scraper-service-dev": "c080oko8408sgkc0ok0sc08c",
  "matrx-ai": "kwsc4k8kc8sowkkwossg08wc",
  "matrx-ai-dev": "g440ksw0owk00ks4ocwwgck0",
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await getClaimsUser(supabase);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await checkIsSuperAdmin(supabase, user.id);
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!COOLIFY_API_TOKEN) {
    return NextResponse.json(
      { error: "COOLIFY_API_TOKEN not configured" },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const appKey = searchParams.get("app") ?? "ai-dream-server";
  const lines = Math.min(
    parseInt(searchParams.get("lines") ?? "200", 10),
    10000,
  );

  const uuid = APP_UUIDS[appKey];
  if (!uuid) {
    return NextResponse.json(
      { error: `Unknown app: ${appKey}` },
      { status: 400 },
    );
  }

  const upstream = await fetch(
    `${COOLIFY_API_URL}/applications/${uuid}/logs?lines=${lines}`,
    {
      headers: { Authorization: `Bearer ${COOLIFY_API_TOKEN}` },
      next: { revalidate: 0 },
    },
  );

  if (!upstream.ok) {
    const body = await upstream.text();
    return NextResponse.json(
      { error: `Coolify returned ${upstream.status}`, detail: body },
      { status: upstream.status },
    );
  }

  const data = (await upstream.json()) as { logs?: string; message?: string };

  return NextResponse.json({
    app: appKey,
    uuid,
    lines,
    logs: data.logs ?? "",
    fetched_at: new Date().toISOString(),
  });
}
