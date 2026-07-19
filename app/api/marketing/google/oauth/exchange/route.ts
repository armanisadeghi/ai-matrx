import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { exchangeAndStoreGoogleConnection } from "@/features/marketing/google/connection-server";

interface ExchangeBody {
  code?: unknown;
  ownerType?: unknown;
  organizationId?: unknown;
  redirectUri?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    if (request.headers.get("x-requested-with") !== "XmlHttpRequest") {
      return NextResponse.json(
        { error: "Google authorization request could not be verified." },
        { status: 400 },
      );
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Sign in to connect Google." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as ExchangeBody;
    if (typeof body.code !== "string" || !body.code.trim()) {
      return NextResponse.json(
        { error: "Google did not return an authorization code." },
        { status: 400 },
      );
    }
    const requestOrigin = request.headers.get("origin");
    if (
      typeof body.redirectUri !== "string" ||
      !requestOrigin ||
      body.redirectUri !== requestOrigin
    ) {
      return NextResponse.json(
        { error: "Google authorization origin could not be verified." },
        { status: 400 },
      );
    }

    const ownerType =
      body.ownerType === "organization" ? "organization" : "user";
    const organizationId =
      ownerType === "organization" && typeof body.organizationId === "string"
        ? body.organizationId
        : null;
    if (ownerType === "organization") {
      if (!organizationId) {
        return NextResponse.json(
          { error: "Choose an organization first." },
          { status: 400 },
        );
      }
      const membership = await createAdminClient()
        .schema("iam")
        .from("memberships")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      if (membership.error || !membership.data) {
        return NextResponse.json(
          {
            error:
              "Only an organization owner or admin can add a shared Google connection.",
          },
          { status: 403 },
        );
      }
    }

    const connectionId = await exchangeAndStoreGoogleConnection({
      code: body.code,
      redirectUri: body.redirectUri,
      userId: data.user.id,
      ownerType,
      organizationId,
    });
    return NextResponse.json({ connectionId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to connect Google.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
