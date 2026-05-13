// File: features/user-profile/types.ts
//
// Typed shapes for the user-profile feature. The DB-generated types treat
// the JSONB columns as `Json`; this file is the source of truth for the
// runtime shape of those columns so the rest of the feature (hooks,
// components, API routes) can stay strictly typed.
//
// All shapes match the Postgres column layout 1:1. RPCs that touch these
// arrays:
//   - user_form_profile_append_to_array(p_column, p_item, p_user_id)
//   - user_form_profile_set_custom_field(p_key, p_user_id, p_value)
//
// Authoritative DB tables: `public.profiles`, `public.user_form_profile`,
// plus `auth.users.user_metadata` (via supabase.auth.updateUser).

import type { Json } from "@/types/database.types";

// ── JSONB row shapes ───────────────────────────────────────────────────────

export type PhoneKind = "mobile" | "home" | "work" | "other";

export interface PhoneEntry {
  id: string;
  label: PhoneKind;
  number: string;
  is_primary?: boolean;
  ext?: string | null;
}

export type EmailKind = "personal" | "work" | "school" | "other";

export interface EmailEntry {
  id: string;
  label: EmailKind;
  email: string;
  is_primary?: boolean;
  is_verified?: boolean;
}

export interface SocialHandle {
  id: string;
  platform: string;
  handle: string;
  url?: string | null;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

export interface ProfileImage {
  id: string;
  url: string;
  caption?: string | null;
  is_primary?: boolean;
}

export type CustomFields = Record<string, unknown>;

// ── Composite shapes for the two API surfaces ─────────────────────────────

/**
 * Account-level identity. Surfaces the auth-metadata fields (canonical for
 * headers and the JWT) plus the chat-visible `public.profiles` row.
 */
export interface UserAccountData {
  // From auth.users.user_metadata — drives Redux userProfile.userMetadata.
  full_name: string | null;
  name: string | null;
  preferred_username: string | null;
  avatar_url: string | null;
  picture: string | null;

  // From public.profiles — chat-visible presence.
  display_name: string;
  status_text: string | null;
  // `is_online` / `last_seen_at` are auto-managed; not editable here.
}

/** Patch payload to /api/user/profile — only the fields the user changed. */
export type UserAccountPatch = Partial<UserAccountData>;

/**
 * Rich form profile — used by agents working on behalf of the user. Mirrors
 * `public.user_form_profile` 1:1, with JSONB columns strongly typed.
 */
export interface UserFormProfileData {
  legal_first_name: string | null;
  legal_middle_name: string | null;
  legal_last_name: string | null;
  preferred_name: string | null;
  name_suffix: string | null;
  pronouns: string | null;
  date_of_birth: string | null; // ISO date

  phones: PhoneEntry[];
  emails: EmailEntry[];
  social_handles: SocialHandle[];
  website_url: string | null;

  shipping_line1: string | null;
  shipping_line2: string | null;
  shipping_city: string | null;
  shipping_region: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;

  billing_same_as_shipping: boolean;
  billing_line1: string | null;
  billing_line2: string | null;
  billing_city: string | null;
  billing_region: string | null;
  billing_postal_code: string | null;
  billing_country: string | null;

  company_name: string | null;
  job_title: string | null;

  emergency_contacts: EmergencyContact[];
  images: ProfileImage[];
  custom_fields: CustomFields;
}

/** Patch payload to /api/user/form-profile. */
export type UserFormProfilePatch = Partial<UserFormProfileData>;

// ── Defaults ──────────────────────────────────────────────────────────────

export const EMPTY_FORM_PROFILE: UserFormProfileData = {
  legal_first_name: null,
  legal_middle_name: null,
  legal_last_name: null,
  preferred_name: null,
  name_suffix: null,
  pronouns: null,
  date_of_birth: null,
  phones: [],
  emails: [],
  social_handles: [],
  website_url: null,
  shipping_line1: null,
  shipping_line2: null,
  shipping_city: null,
  shipping_region: null,
  shipping_postal_code: null,
  shipping_country: null,
  billing_same_as_shipping: true,
  billing_line1: null,
  billing_line2: null,
  billing_city: null,
  billing_region: null,
  billing_postal_code: null,
  billing_country: null,
  company_name: null,
  job_title: null,
  emergency_contacts: [],
  images: [],
  custom_fields: {},
};

export const EMPTY_ACCOUNT_DATA: UserAccountData = {
  full_name: null,
  name: null,
  preferred_username: null,
  avatar_url: null,
  picture: null,
  display_name: "User",
  status_text: null,
};

// ── Section ids ───────────────────────────────────────────────────────────
//
// Used by the page form + the settings sub-tab wrappers. Each id is a stable
// DOM anchor on the page. Bumping these = bumping the sub-tab IDs in the
// settings registry too.

export const PROFILE_SECTION_IDS = {
  header: "profile-header",
  display: "profile-display",
  identity: "profile-identity",
  contact: "profile-contact",
  shipping: "profile-shipping",
  billing: "profile-billing",
  work: "profile-work",
  emergency: "profile-emergency",
  account: "profile-account",
} as const;

export type ProfileSectionId =
  (typeof PROFILE_SECTION_IDS)[keyof typeof PROFILE_SECTION_IDS];

// ── Runtime guards for JSONB columns ──────────────────────────────────────
//
// Postgres returns these as `Json`; on read we normalize them to the typed
// shape, dropping malformed entries instead of throwing. The DB has no
// CHECK constraints on these arrays today, so external writers could
// theoretically write garbage — we tolerate it gracefully.

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function normalizePhones(input: Json | null | undefined): PhoneEntry[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): PhoneEntry[] => {
    if (!raw || typeof raw !== "object") return [];
    const obj = raw as Record<string, unknown>;
    const number = asNonEmptyString(obj.number);
    if (!number) return [];
    const label = (obj.label as PhoneKind) ?? "mobile";
    return [
      {
        id: asNonEmptyString(obj.id) ?? crypto.randomUUID(),
        label: ["mobile", "home", "work", "other"].includes(label)
          ? label
          : "mobile",
        number,
        is_primary: asBool(obj.is_primary),
        ext: asString(obj.ext),
      },
    ];
  });
}

export function normalizeEmails(input: Json | null | undefined): EmailEntry[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): EmailEntry[] => {
    if (!raw || typeof raw !== "object") return [];
    const obj = raw as Record<string, unknown>;
    const email = asNonEmptyString(obj.email);
    if (!email) return [];
    const label = (obj.label as EmailKind) ?? "personal";
    return [
      {
        id: asNonEmptyString(obj.id) ?? crypto.randomUUID(),
        label: ["personal", "work", "school", "other"].includes(label)
          ? label
          : "personal",
        email,
        is_primary: asBool(obj.is_primary),
        is_verified: asBool(obj.is_verified),
      },
    ];
  });
}

export function normalizeSocialHandles(
  input: Json | null | undefined,
): SocialHandle[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): SocialHandle[] => {
    if (!raw || typeof raw !== "object") return [];
    const obj = raw as Record<string, unknown>;
    const platform = asNonEmptyString(obj.platform);
    const handle = asNonEmptyString(obj.handle);
    if (!platform || !handle) return [];
    return [
      {
        id: asNonEmptyString(obj.id) ?? crypto.randomUUID(),
        platform,
        handle,
        url: asString(obj.url),
      },
    ];
  });
}

export function normalizeEmergencyContacts(
  input: Json | null | undefined,
): EmergencyContact[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): EmergencyContact[] => {
    if (!raw || typeof raw !== "object") return [];
    const obj = raw as Record<string, unknown>;
    const name = asNonEmptyString(obj.name);
    if (!name) return [];
    return [
      {
        id: asNonEmptyString(obj.id) ?? crypto.randomUUID(),
        name,
        relationship: asString(obj.relationship),
        phone: asString(obj.phone),
        email: asString(obj.email),
        notes: asString(obj.notes),
      },
    ];
  });
}

export function normalizeImages(
  input: Json | null | undefined,
): ProfileImage[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((raw): ProfileImage[] => {
    if (!raw || typeof raw !== "object") return [];
    const obj = raw as Record<string, unknown>;
    const url = asNonEmptyString(obj.url);
    if (!url) return [];
    return [
      {
        id: asNonEmptyString(obj.id) ?? crypto.randomUUID(),
        url,
        caption: asString(obj.caption),
        is_primary: asBool(obj.is_primary),
      },
    ];
  });
}

export function normalizeCustomFields(
  input: Json | null | undefined,
): CustomFields {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as CustomFields;
}
