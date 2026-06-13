// Super-Admin-only user listing + onboarding-flag management.
//
// Reads the full auth.users roster via the service-key admin client (RLS
// bypass) and exposes the per-user onboarding flag stored on
// user_metadata.onboarding_completed.
//
// Defense: requireSuperAdmin() gates every method. The admin client is
// server-only (SUPABASE_SECRET_KEY) and never reaches the browser.

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { ONBOARDING_METADATA_KEY } from "@/utils/onboarding";

const PER_PAGE = 1000;
const MAX_PAGES = 50; // hard ceiling: 50k users

interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  onboarding_completed: boolean;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

// GET /api/admin/users — list every auth user with their onboarding flag.
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const admin = createAdminClient();
  const rows: UserRow[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PER_PAGE,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const users = data?.users ?? [];
    for (const u of users) {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const fullName =
        typeof meta.full_name === "string"
          ? meta.full_name
          : typeof meta.name === "string"
            ? meta.name
            : null;
      rows.push({
        id: u.id,
        email: u.email ?? null,
        full_name: fullName,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        onboarding_completed: meta[ONBOARDING_METADATA_KEY] === true,
      });
    }

    if (users.length < PER_PAGE) break;
  }

  return NextResponse.json({ users: rows });
}

// PATCH /api/admin/users — flip a user's onboarding flag.
// Body: { userId: string, onboardingCompleted: boolean }
export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    onboardingCompleted?: boolean;
  } | null;

  if (!body?.userId || typeof body.onboardingCompleted !== "boolean") {
    return NextResponse.json(
      { error: "userId and boolean onboardingCompleted are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Merge into existing metadata so we don't clobber other keys.
  const { data: existing, error: fetchError } =
    await admin.auth.admin.getUserById(body.userId);
  if (fetchError || !existing?.user) {
    return NextResponse.json(
      { error: fetchError?.message ?? "User not found" },
      { status: 404 },
    );
  }

  const mergedMetadata = {
    ...(existing.user.user_metadata ?? {}),
    [ONBOARDING_METADATA_KEY]: body.onboardingCompleted,
  };

  const { error: updateError } = await admin.auth.admin.updateUserById(
    body.userId,
    { user_metadata: mergedMetadata },
  );
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    userId: body.userId,
    onboarding_completed: body.onboardingCompleted,
  });
}
