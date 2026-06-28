// File: app/api/user/form-profile/route.ts
//
// CRUD for `public.user_form_profile` — the rich "agent-on-behalf-of-user"
// profile (legal name, addresses, phones, emails, social handles, emergency
// contacts, work info, custom fields). RLS guarantees the user can only
// touch their own row; we still validate `user_id` on every write.
//
// PATCH is an upsert: a missing row is created on first save so callers
// don't have to manage a separate "create profile" flow. Only fields
// actually present in the request body are written — partial patches are
// the common case from per-section saves on the UI.
//
// Companion route: /api/user/profile (auth metadata + public.profiles).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import type { Database, Json } from "@/types/database.types";
import {
  EMPTY_FORM_PROFILE,
  normalizeCustomFields,
  normalizeEmails,
  normalizeEmergencyContacts,
  normalizeImages,
  normalizePhones,
  normalizeSocialHandles,
  type UserFormProfileData,
  type UserFormProfilePatch,
} from "@/features/user-profile/types";

type FormProfileRow = Database["public"]["Tables"]["user_form_profile"]["Row"];
type FormProfileInsert =
  Database["public"]["Tables"]["user_form_profile"]["Insert"];

const SCALAR_TEXT_FIELDS = [
  "legal_first_name",
  "legal_middle_name",
  "legal_last_name",
  "preferred_name",
  "name_suffix",
  "pronouns",
  "date_of_birth",
  "website_url",
  "shipping_line1",
  "shipping_line2",
  "shipping_city",
  "shipping_region",
  "shipping_postal_code",
  "shipping_country",
  "billing_line1",
  "billing_line2",
  "billing_city",
  "billing_region",
  "billing_postal_code",
  "billing_country",
  "company_name",
  "job_title",
] as const satisfies readonly (keyof UserFormProfileData)[];

const JSONB_ARRAY_FIELDS = [
  "phones",
  "emails",
  "social_handles",
  "emergency_contacts",
  "images",
] as const satisfies readonly (keyof UserFormProfileData)[];

function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}

function rowToData(row: FormProfileRow | null): UserFormProfileData {
  if (!row) return { ...EMPTY_FORM_PROFILE };
  return {
    legal_first_name: row.legal_first_name,
    legal_middle_name: row.legal_middle_name,
    legal_last_name: row.legal_last_name,
    preferred_name: row.preferred_name,
    name_suffix: row.name_suffix,
    pronouns: row.pronouns,
    date_of_birth: row.date_of_birth,
    phones: normalizePhones(row.phones),
    emails: normalizeEmails(row.emails),
    social_handles: normalizeSocialHandles(row.social_handles),
    website_url: row.website_url,
    shipping_line1: row.shipping_line1,
    shipping_line2: row.shipping_line2,
    shipping_city: row.shipping_city,
    shipping_region: row.shipping_region,
    shipping_postal_code: row.shipping_postal_code,
    shipping_country: row.shipping_country,
    billing_same_as_shipping: row.billing_same_as_shipping,
    billing_line1: row.billing_line1,
    billing_line2: row.billing_line2,
    billing_city: row.billing_city,
    billing_region: row.billing_region,
    billing_postal_code: row.billing_postal_code,
    billing_country: row.billing_country,
    company_name: row.company_name,
    job_title: row.job_title,
    emergency_contacts: normalizeEmergencyContacts(row.emergency_contacts),
    images: normalizeImages(row.images),
    custom_fields: normalizeCustomFields(row.custom_fields),
  };
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

    const { data: row, error } = await supabase
      .schema("users").from("user_form_profile")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[/api/user/form-profile GET] select:", error);
      return NextResponse.json(
        { success: false, msg: "Failed to load form profile" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, data: rowToData(row) });
  } catch (error) {
    console.error("[/api/user/form-profile GET] unexpected:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to load form profile" },
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

    let body: UserFormProfilePatch;
    try {
      body = (await request.json()) as UserFormProfilePatch;
    } catch {
      return NextResponse.json(
        { success: false, msg: "Invalid JSON body" },
        { status: 400 },
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, msg: "Patch body must be an object" },
        { status: 400 },
      );
    }

    // Build the patch — only fields actually present in the body. This keeps
    // per-section saves cheap and prevents accidentally clobbering data the
    // form didn't load.
    const patch: Partial<FormProfileInsert> = { user_id: user.id };

    for (const key of SCALAR_TEXT_FIELDS) {
      if (key in body) {
        const v = (body as Record<string, unknown>)[key];
        if (!isStringOrNull(v)) {
          return NextResponse.json(
            { success: false, msg: `Field "${key}" must be a string or null` },
            { status: 400 },
          );
        }
        (patch as Record<string, unknown>)[key] = v;
      }
    }

    if ("billing_same_as_shipping" in body) {
      if (typeof body.billing_same_as_shipping !== "boolean") {
        return NextResponse.json(
          {
            success: false,
            msg: '"billing_same_as_shipping" must be boolean',
          },
          { status: 400 },
        );
      }
      patch.billing_same_as_shipping = body.billing_same_as_shipping;
    }

    for (const key of JSONB_ARRAY_FIELDS) {
      if (key in body) {
        const v = (body as Record<string, unknown>)[key];
        if (!Array.isArray(v)) {
          return NextResponse.json(
            { success: false, msg: `Field "${key}" must be an array` },
            { status: 400 },
          );
        }
        // Stored as JSONB; Supabase serializes arrays/objects automatically.
        (patch as Record<string, unknown>)[key] = v as Json;
      }
    }

    if ("custom_fields" in body) {
      const v = body.custom_fields;
      if (!v || typeof v !== "object" || Array.isArray(v)) {
        return NextResponse.json(
          { success: false, msg: '"custom_fields" must be a JSON object' },
          { status: 400 },
        );
      }
      patch.custom_fields = v as Json;
    }

    // Always refresh updated_at so the UI's "last modified" feels right.
    patch.updated_at = new Date().toISOString();

    // Upsert by user_id (the table's PRIMARY KEY) so a missing row is
    // created on first save. RLS still enforces auth.uid() == user_id on
    // both INSERT (with_check) and UPDATE (qual).
    const { data: row, error: upsertError } = await supabase
      .schema("users").from("user_form_profile")
      .upsert(patch as FormProfileInsert, { onConflict: "user_id" })
      .select("*")
      .single();

    if (upsertError) {
      console.error("[/api/user/form-profile PATCH] upsert:", upsertError);
      return NextResponse.json(
        { success: false, msg: upsertError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: rowToData(row),
      msg: "Form profile updated",
    });
  } catch (error) {
    console.error("[/api/user/form-profile PATCH] unexpected:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to update form profile" },
      { status: 500 },
    );
  }
}
