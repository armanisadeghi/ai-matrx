import "server-only";

// features/portals/service.ts — THE CLIENT PORTAL'S ONLY DATA ACCESS.
//
// A client of a business ("Ada Brook Cafes") follows a link, signs in with a
// one-time email link, and sees HER jobs and HER invoices and nothing else.
// This module is the app's whole half of that, and nothing else anywhere in the
// repo touches these doors. It is modelled line-for-line on
// `features/forms/service.ts`, which is the same shape for the same reasons.
//
// TWO LANES, AND WHY THEY ARE DIFFERENT ROLES.
// --------------------------------------------
// 1. THE SIGN-IN LANE (`portal_public`, `portal_invitation`,
//    `portal_principal_bind`) is `service_role`, exactly like the public form's
//    two doors. `custom.portal_public` answers the SIGN-IN PAGE'S OWN WORDS to
//    somebody who is not signed in yet, and `custom.portal_invitation` says
//    whether an address was invited — which is precisely the question a signed-in
//    stranger must never be able to ask about somebody else's address, so that
//    door refuses any signed-in caller IN ITS OWN BODY. Both are reached with
//    `createAdminClient()`, whose key never leaves this process.
//
// 2. THE SIGNED-IN LANE (`portal_me`, `read_records`, `read_record`,
//    `record_update`, `applicable_fields`, `io_comments`, `io_comment_write`) is
//    THE PERSON'S OWN SERVER CLIENT — `utils/supabase/server.ts` — and NEVER the
//    admin client. 🚨 This is not a style preference. The doors are what decide
//    what Ada sees: they resolve `auth.uid()` to her portal principal, scope
//    every read to her client record, mask every field the portal did not open
//    and refuse every write it did not open. The admin client bypasses all of
//    it, so an admin-client "portal" would show every client's rows to whoever
//    opened the page. The product IS the door; reaching around it deletes the
//    product.
//
// 404 IS THE ANSWER TO THREE QUESTIONS, exactly as `custom.form_public` does it:
// a portal that does not exist, one that is closed, and one whose organization
// has not opened its external lane all answer `null`. Telling them apart would
// let a slug be used to learn that something is there.

import { cache } from "react";

import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/claimsUser";

/**
 * THE STORE'S SCHEMA IS NOT IN `types/database.types.ts`, AND THAT IS CORRECT —
 * the reasoning is written out in full in `features/forms/service.ts`. Schema
 * `custom` is reached through its doors, so the cast happens HERE, once, named,
 * and every result shape is declared below so a door that changes its answer
 * shows up as a type error rather than as a wrong screen.
 */
type StoreCaller = {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; hint?: string | null; code?: string | null } | null;
  }>;
};

function adminDoors(): StoreCaller {
  return (createAdminClient() as unknown as { schema(name: string): StoreCaller }).schema(
    "custom",
  );
}

async function myDoors(): Promise<StoreCaller> {
  const supabase = await createClient();
  return (supabase as unknown as { schema(name: string): StoreCaller }).schema("custom");
}

/** A door that refused said something; it is carried whole, never swallowed. */
export class DoorRefusal extends Error {
  readonly door: string;
  readonly hint: string | null;
  readonly code: string | null;
  constructor(door: string, message: string, hint?: string | null, code?: string | null) {
    super(message);
    this.name = "DoorRefusal";
    this.door = door;
    this.hint = hint ?? null;
    this.code = code ?? null;
  }
}

function unwrap<T>(
  door: string,
  result: { data: unknown; error: { message: string; hint?: string | null; code?: string | null } | null },
): T {
  if (result.error) {
    throw new DoorRefusal(door, result.error.message, result.error.hint, result.error.code);
  }
  return result.data as T;
}

// ---------------------------------------------------------------------------
// THE SIGN-IN LANE — service_role, server-only, never the browser.
// ---------------------------------------------------------------------------

/** What `custom.portal_public` answers, exactly. */
export interface PortalPublic {
  portal_id: string;
  slug: string;
  title: string;
  organization: string;
  sign_in_method: string;
  state: "open";
}

/**
 * The portal behind a link, in its own words — or `null`, which is the 404 and
 * is the same answer for missing, closed, and external-lane-not-opened.
 *
 * `cache()` dedupes it within one request because `generateMetadata` and the
 * page both want it.
 */
export const portalPublic = cache(async (slug: string): Promise<PortalPublic | null> => {
  const clean = (slug ?? "").trim().toLowerCase();
  if (!clean || clean.length > 200) return null;
  const row = unwrap<PortalPublic | null>(
    "custom.portal_public",
    await adminDoors().rpc("portal_public", { p_slug: clean }),
  );
  return row ?? null;
});

/** What `custom.portal_invitation` answers when the address was invited. */
export interface PortalInvitation {
  principal_id: string;
  portal_id: string;
  organization_id: string;
  email: string;
  bound: boolean;
}

/**
 * Whether this address was invited to this portal — `null` when it was not.
 *
 * 🚨 THE ANSWER NEVER REACHES THE PERSON. The sign-in route says the same
 * sentence either way; this value only decides whether a link is minted. A
 * response that differed would turn the portal into an address oracle.
 */
export async function portalInvitation(
  slug: string,
  email: string,
): Promise<PortalInvitation | null> {
  const row = unwrap<PortalInvitation | null>(
    "custom.portal_invitation",
    await adminDoors().rpc("portal_invitation", {
      p_slug: (slug ?? "").trim().toLowerCase(),
      p_email: (email ?? "").trim(),
    }),
  );
  return row ?? null;
}

/** Bind the invited principal to the auth user the link will sign in as. */
export async function portalPrincipalBind(args: {
  organizationId: string;
  principalId: string;
  userId: string;
}): Promise<void> {
  unwrap<unknown>(
    "custom.portal_principal_bind",
    await adminDoors().rpc("portal_principal_bind", {
      p_organization_id: args.organizationId,
      p_principal_id: args.principalId,
      p_user_id: args.userId,
    }),
  );
}

// ---------------------------------------------------------------------------
// THE SIGNED-IN LANE — the person's own client. Never the admin client.
// ---------------------------------------------------------------------------

/** One Table this portal shows, and what it opened on it. */
export interface PortalTable {
  table_id: string;
  name: string;
  /** The field keys the portal SHOWS, in the portal's own order. */
  visible_fields: string[];
  /** The subset of those the portal lets her change. */
  editable_fields: string[];
  comments: boolean;
}

/** One portal this person is a principal of. */
export interface PortalMembership {
  portal_id: string;
  title: string;
  slug: string;
  organization_id: string;
  organization: string;
  principal_id: string;
  client_record_id: string;
  client: string;
  tables: PortalTable[];
}

/**
 * The signed-in person, or `null`.
 *
 * 🚨 AN ANONYMOUS SESSION COUNTS AS SIGNED OUT HERE. This app issues anonymous
 * Supabase sessions, and they carry the `authenticated` role — so
 * `custom.portal_me()` would run for one and answer "no portals", which the
 * page would render as "you are signed in, but not on this portal". The right
 * screen for somebody who never signed in is the sign-in panel.
 */
export const portalViewer = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await createClient();
  const { data } = await getClaimsUser(supabase);
  const user = data?.user;
  if (!user || user.is_anonymous) return null;
  return { id: user.id, email: user.email ?? null };
});

/** What `custom.portal_me()` answers, exactly. */
export interface PortalMe {
  signed_in: boolean;
  user_id: string | null;
  external: boolean;
  portals: PortalMembership[];
}

/**
 * Who the caller is, in the store's words, and which portals are hers.
 *
 * This is the ONE question the screens ask about identity. There is no second
 * source: no cookie read, no membership lookup, no "is this an outsider" guess
 * in the app. `custom.portal_me()` takes no argument and answers for
 * `auth.uid()`, so there is nothing here to point at anybody else.
 */
export const portalMe = cache(async (): Promise<PortalMe> => {
  const me = unwrap<PortalMe | null>(
    "custom.portal_me",
    await (await myDoors()).rpc("portal_me", {}),
  );
  return me ?? { signed_in: false, user_id: null, external: false, portals: [] };
});

/** The portal in `portal_me()` that this slug names, or `null`. */
export function membershipFor(me: PortalMe, slug: string): PortalMembership | null {
  const clean = (slug ?? "").trim().toLowerCase();
  return me.portals.find((p) => p.slug?.toLowerCase() === clean) ?? null;
}

/** One record as the door hands it over, with the level it granted. */
export interface PortalRecord {
  id: string;
  document: Record<string, unknown>;
  level: string;
}

/**
 * Her records in one of the portal's Tables.
 *
 * 🚨 THE UI DOES NOT FILTER ROWS. `custom.read_records` already scoped this to
 * her client record; a second filter in the app would be a second opinion about
 * access, and the wrong one. What the screens DO read off the portal is
 * `visible_fields` — the portal's own list of the keys it shows, in its own
 * order — because the door returns a masked field as a NULL key beside a
 * `_hidden` explanation rather than removing it, and enumerating the document's
 * keys would print the NAME of a field the portal never opened.
 */
export async function portalRecords(args: {
  organizationId: string;
  tableId: string;
  limit?: number;
  offset?: number;
}): Promise<PortalRecord[]> {
  const rows = unwrap<PortalRecord[] | null>(
    "custom.read_records",
    await (await myDoors()).rpc("read_records", {
      p_organization_id: args.organizationId,
      p_table_id: args.tableId,
      p_by_id: false,
      p_limit: args.limit ?? 200,
      p_offset: args.offset ?? 0,
    }),
  );
  return rows ?? [];
}

/** One record of hers, masked the same way. `null` when the door shows nothing. */
export async function portalRecord(args: {
  organizationId: string;
  recordId: string;
}): Promise<Record<string, unknown> | null> {
  const doc = unwrap<Record<string, unknown> | null>(
    "custom.read_record",
    await (await myDoors()).rpc("read_record", {
      p_organization_id: args.organizationId,
      p_record_id: args.recordId,
      p_by_id: false,
    }),
  );
  return doc ?? null;
}

/** A Field as the store defines it — this is where a label and a type come from. */
export interface PortalField {
  key: string;
  label: string;
  type: string;
  sort: number;
}

/**
 * The labels and types for one Table's Fields. The portal decides WHICH keys a
 * screen shows; this decides what each one is CALLED, so a screen never invents
 * a label by title-casing a column name.
 */
export const portalFields = cache(
  async (organizationId: string, tableId: string): Promise<PortalField[]> => {
    const rows = unwrap<Array<{ data?: Record<string, unknown> }> | null>(
      "custom.applicable_fields",
      await (await myDoors()).rpc("applicable_fields", {
        p_organization_id: organizationId,
        p_table_id: tableId,
        p_record_type: null,
      }),
    );
    return (rows ?? [])
      .map((row) => row?.data ?? {})
      .filter((d) => typeof d.key === "string" && d.key !== "")
      .map((d) => ({
        key: String(d.key),
        label: typeof d.label === "string" && d.label.trim() ? d.label : String(d.key),
        type: typeof d.type === "string" ? d.type : "text",
        sort: typeof d.sort === "number" ? d.sort : 100,
      }));
  },
);

/**
 * Change one record.
 *
 * `p_expected_version` is `null` on purpose and it is the door's own documented
 * posture: a write that declares no base revision is last-write-wins, which is
 * what a direct UPDATE always was. The portal's read doors do not hand a version
 * out, so declaring one would mean inventing it — and an invented base revision
 * is worse than none, because it would fail a compare-and-swap against a number
 * that never described anything.
 *
 * A field the portal did not open is REFUSED BY THE DOOR, and the refusal is
 * thrown as a `DoorRefusal` carrying the store's own sentence and hint. Nothing
 * here decides what may change.
 */
export async function portalRecordUpdate(args: {
  organizationId: string;
  recordId: string;
  patch: Record<string, unknown>;
}): Promise<number> {
  return unwrap<number>(
    "custom.record_update",
    await (await myDoors()).rpc("record_update", {
      p_organization_id: args.organizationId,
      p_record_id: args.recordId,
      p_patch: args.patch,
      p_expected_version: null,
    }),
  );
}

/** One comment on a record, as `custom.io_comments` returns it. */
export interface PortalComment {
  id: string;
  body: string;
  anchor: unknown;
  parent_comment_id: string | null;
  created_by: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

/** The thread on one record, oldest first. */
export async function portalComments(args: {
  organizationId: string;
  recordId: string;
}): Promise<PortalComment[]> {
  const rows = unwrap<PortalComment[] | null>(
    "custom.io_comments",
    await (await myDoors()).rpc("io_comments", {
      p_organization_id: args.organizationId,
      p_record_id: args.recordId,
      p_include_resolved: true,
    }),
  );
  return (rows ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** Say something on a record. Only where the portal allows comments. */
export async function portalCommentWrite(args: {
  organizationId: string;
  recordId: string;
  body: string;
}): Promise<string> {
  return unwrap<string>(
    "custom.io_comment_write",
    await (await myDoors()).rpc("io_comment_write", {
      p_organization_id: args.organizationId,
      p_record_id: args.recordId,
      p_body: args.body,
      p_anchor: null,
      p_parent_comment_id: null,
    }),
  );
}
