import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { decryptCredential } from "@/features/marketing/google/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Sign in to disconnect Google." },
        { status: 401 },
      );
    }
    const body = (await request.json()) as { connectionId?: unknown };
    if (typeof body.connectionId !== "string") {
      return NextResponse.json(
        { error: "Choose a Google connection." },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const table = admin.schema("users").from("integration_connections");
    const connection = await table
      .select(
        "id, owner_user_id, organization_id, credential_ciphertext, credential_iv, credential_tag",
      )
      .eq("id", body.connectionId)
      .is("deleted_at", null)
      .maybeSingle();
    if (connection.error || !connection.data) {
      return NextResponse.json(
        { error: "Google connection was not found." },
        { status: 404 },
      );
    }

    let authorized = connection.data.owner_user_id === data.user.id;
    if (!authorized && connection.data.organization_id) {
      const membership = await admin
        .schema("iam")
        .from("memberships")
        .select("id")
        .eq("organization_id", connection.data.organization_id)
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      authorized = Boolean(membership.data && !membership.error);
    }
    if (!authorized) {
      return NextResponse.json(
        { error: "You cannot disconnect this Google account." },
        { status: 403 },
      );
    }

    const credential = decryptCredential({
      ciphertext: connection.data.credential_ciphertext,
      iv: connection.data.credential_iv,
      tag: connection.data.credential_tag,
    });
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(credential.refreshToken)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    ).catch(() => undefined);

    const now = new Date().toISOString();
    const resources = await admin
      .schema("users")
      .from("integration_connection_resources")
      .update({ deleted_at: now, updated_at: now })
      .eq("connection_id", connection.data.id)
      .is("deleted_at", null);
    if (resources.error) throw new Error(resources.error.message);
    const disconnected = await table
      .update({ status: "revoked", deleted_at: now, updated_at: now })
      .eq("id", connection.data.id);
    if (disconnected.error) throw new Error(disconnected.error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to disconnect Google.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
