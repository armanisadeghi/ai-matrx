// File: app/api/user/profile/route.ts
//
// User account identity API. Owns the "header-visible" identity surface:
//   • auth.users.user_metadata — full_name, name, preferred_username,
//     avatar_url, picture. Updated via supabase.auth.updateUser({ data })
//     so the JWT and the USER_UPDATED auth event fire correctly.
//   • user.profiles — chat-visible display_name, avatar_url, status_text.
//     Upserted so a missing row is created on first save.
//
// The richer `users.user_form_profile` (legal name, addresses, phones,
// etc.) is owned by /api/user/form-profile/route.ts. This route is
// intentionally limited to what drives the header avatar/name everywhere.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { UserAccountData, UserAccountPatch } from "@/features/user-profile/types";
import { EMPTY_ACCOUNT_DATA } from "@/features/user-profile/types";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";
import {
  isOrganizationRequiredServerError,
  organizationRequiredResponse,
} from "@/lib/organizations/organizationRequiredResponse";

// Fields the client is allowed to PATCH on this surface. Anything outside
// this list is ignored — auth.users has many sensitive metadata namespaces
// (system, app, identity) we never want to expose to a generic PATCH.
const AUTH_META_FIELDS = [
  "full_name",
  "name",
  "preferred_username",
  "avatar_url",
  // Durable cld_files reference for the avatar — stored alongside avatar_url
  // in user_metadata. There is no DB column; this rides the JSONB blob.
  "avatar_file_id",
  "picture",
] as const satisfies readonly (keyof UserAccountData)[];

const PROFILES_FIELDS = [
  "display_name",
  "status_text",
  // avatar_url is shared with auth metadata — we sync it into both tables
  // when present in the patch.
  "avatar_url",
] as const;

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

    // Pull the chat-visible row (may not exist yet — that's fine, we return
    // sensible defaults so the form has values to bind to).
    const { data: profileRow, error: profileError } = await supabase
      .schema("users").from("profiles")
      .select("display_name, avatar_url, status_text")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[/api/user/profile GET] profiles read failed:", profileError);
    }

    const data: UserAccountData = {
      full_name: isString(meta.full_name) ? meta.full_name : null,
      name: isString(meta.name) ? meta.name : null,
      preferred_username: isString(meta.preferred_username)
        ? meta.preferred_username
        : null,
      avatar_url: isString(meta.avatar_url) ? meta.avatar_url : null,
      avatar_file_id: isString(meta.avatar_file_id)
        ? meta.avatar_file_id
        : null,
      picture: isString(meta.picture) ? meta.picture : null,
      display_name:
        profileRow?.display_name ??
        (isString(meta.full_name) ? meta.full_name : null) ??
        (isString(meta.name) ? meta.name : null) ??
        EMPTY_ACCOUNT_DATA.display_name,
      status_text: profileRow?.status_text ?? null,
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[/api/user/profile GET] unexpected:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to load profile" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 },
      );
    }

    let body: UserAccountPatch;
    try {
      body = (await request.json()) as UserAccountPatch;
    } catch {
      return NextResponse.json(
        { success: false, msg: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, msg: "Patch body must be an object" },
        { status: 400 },
      );
    }

    // Build the auth-metadata patch. Only include fields actually present
    // in the body so we don't accidentally null out an unrelated field.
    const metaPatch: Record<string, string | null> = {};
    for (const key of AUTH_META_FIELDS) {
      if (key in body) {
        const v = (body as Record<string, unknown>)[key];
        if (!isStringOrNull(v)) {
          return NextResponse.json(
            { success: false, msg: `Field "${key}" must be a string or null` },
            { status: 400 },
          );
        }
        metaPatch[key] = v;
      }
    }

    // Build the users.profiles patch.
    const profilesPatch: Record<string, string | null> = {};
    for (const key of PROFILES_FIELDS) {
      if (key in body) {
        const v = (body as Record<string, unknown>)[key];
        if (!isStringOrNull(v)) {
          return NextResponse.json(
            { success: false, msg: `Field "${key}" must be a string or null` },
            { status: 400 },
          );
        }
        profilesPatch[key] = v;
      }
    }

    // 🚨 THE ORGANIZATION QUESTION IS SETTLED BEFORE ANYTHING IS WRITTEN.
    // Until 2026-09-19 the profiles upsert read
    // `ensureOrgIdServer(supabase, null)`, which ended in the
    // `current_personal_org_id()` RPC — the server stamping the row with the
    // person's personal workspace because the request named no organization.
    // The old comment called that deliberate ("a per-person singleton, PK =
    // the user id"), but the primary key is what makes the row a singleton;
    // `organization_id` is still a tenant, and picking it here is exactly the
    // substitution the 2026-09-19 ruling forbids. The caller states the
    // organization on `X-Organization-Id` — the header every Matrx client
    // carries and every other org-scoped route under app/api/** already reads
    // (app/api/_lib/apply-scope-to-insert.ts).
    //
    // It is resolved HERE, above the `auth.updateUser` call that used to run
    // first, because a refusal issued after that call would have already
    // written the person's name and avatar into auth metadata and then told
    // them nothing was saved. A refusal must find the account exactly as it
    // was: both writes happen after the question is answered, or neither does.
    //
    // 🚨 THE RESOLVED ORGANIZATION NEVER PASSES THROUGH A NULLABLE BINDING.
    // A `let organizationId: string | null` narrowed at the write is enough
    // for the compiler and NOT enough for `check:org-insert-scope`, which
    // follows the payload value back through its declaration: a nullable
    // anywhere in that chain is a write that MAY send null, and a null here
    // is `public._stamp_org_default` stamping the writer's personal workspace
    // — precisely the substitution this handler just stopped making. So the
    // resolve and the write live in ONE branch, the binding is `const` and
    // `string`, and there is no path by which an absent organization reaches
    // the upsert. The guard is right to refuse the SHAPE even where today's
    // flow happens to be safe: the next edit to this block is what makes it
    // unsafe.
    const writesProfile = Object.keys(profilesPatch).length > 0;

    // The auth-metadata half, factored out so it can run in either branch and
    // always AFTER the organization question is answered. It returns the
    // error response to send, or null when it is done.
    const applyMetaPatch = async (): Promise<NextResponse | null> => {
      if (Object.keys(metaPatch).length === 0) return null;
      // Merge over existing user_metadata — Supabase's updateUser does this
      // shallow merge for top-level keys, which is what we want.
      const { error: updateError } = await supabase.auth.updateUser({
        data: metaPatch,
      });
      if (updateError) {
        console.error("[/api/user/profile PATCH] auth updateUser:", updateError);
        return NextResponse.json(
          { success: false, msg: updateError.message },
          { status: 500 },
        );
      }
      return null;
    };

    if (writesProfile) {
      // Answered BEFORE anything is written — a refusal issued after
      // `auth.updateUser` would have already saved the person's name and
      // avatar and then told them nothing was saved.
      const actingOrganizationId =
        request.headers.get("X-Organization-Id")?.trim() || undefined;
      const writeOrganizationId = await ensureOrgIdServer(
        supabase,
        actingOrganizationId,
      );

      const metaFailure = await applyMetaPatch();
      if (metaFailure) return metaFailure;

      // display_name is NOT NULL in the table; if the caller clears it, fall
      // back to the auth-metadata full_name or the literal "User".
      if (profilesPatch.display_name === null) {
        const fallback =
          metaPatch.full_name ??
          (isString(user.user_metadata?.full_name)
            ? user.user_metadata.full_name
            : null) ??
          "User";
        profilesPatch.display_name = fallback;
      }

      const { error: upsertError } = await supabase
        .schema("users").from("profiles")
        .upsert(
          {
            id: user.id,
            organization_id: writeOrganizationId,
            ...profilesPatch,
            // Keep updated_at fresh on every save.
            updated_at: new Date().toISOString(),
            // display_name has a default; force a real string on first insert.
            display_name:
              profilesPatch.display_name ?? EMPTY_ACCOUNT_DATA.display_name,
          },
          { onConflict: "id" },
        );

      if (upsertError) {
        console.error("[/api/user/profile PATCH] profiles upsert:", upsertError);
        return NextResponse.json(
          { success: false, msg: upsertError.message },
          { status: 500 },
        );
      }
    } else {
      // Nothing organization-scoped is being written, so there is no
      // organization to ask about: a metadata-only save (name, avatar) must
      // not be held behind a question it does not need answered.
      const metaFailure = await applyMetaPatch();
      if (metaFailure) return metaFailure;
    }

    // Echo the new state back so the client can reconcile without a refetch.
    const echoUser = (await supabase.auth.getUser()).data.user;
    const echoMeta = (echoUser?.user_metadata ?? {}) as Record<string, unknown>;
    const { data: echoProfile } = await supabase
      .schema("users").from("profiles")
      .select("display_name, avatar_url, status_text")
      .eq("id", user.id)
      .maybeSingle();

    const data: UserAccountData = {
      full_name: isString(echoMeta.full_name) ? echoMeta.full_name : null,
      name: isString(echoMeta.name) ? echoMeta.name : null,
      preferred_username: isString(echoMeta.preferred_username)
        ? echoMeta.preferred_username
        : null,
      avatar_url: isString(echoMeta.avatar_url) ? echoMeta.avatar_url : null,
      avatar_file_id: isString(echoMeta.avatar_file_id)
        ? echoMeta.avatar_file_id
        : null,
      picture: isString(echoMeta.picture) ? echoMeta.picture : null,
      display_name:
        echoProfile?.display_name ?? EMPTY_ACCOUNT_DATA.display_name,
      status_text: echoProfile?.status_text ?? null,
    };

    return NextResponse.json({
      success: true,
      data,
      msg: "Profile updated",
    });
  } catch (error) {
    // The organization refusal is an ANSWER, not a failure: it carries the
    // caller's own memberships so the client can hold the save, show the
    // picker and retry. Collapsing it into the generic 500 below would turn
    // the one question the person can answer into a dead end.
    if (isOrganizationRequiredServerError(error)) {
      return organizationRequiredResponse(error);
    }
    console.error("[/api/user/profile PATCH] unexpected:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to update profile" },
      { status: 500 },
    );
  }
}
