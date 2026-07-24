/**
 * CMS Collections API Route (W2-C) — ownership-secured, single-POST {action} dispatch
 *
 * Admin surface for `site_collections` (the definition — versioned content
 * entity, token `site_collection`) and `site_collection_items` (the rows —
 * append-heavy, NOT versioned). CMS migration 0015. All owner-scoped actions
 * verify the collection's site is owned by the authenticated user;
 * `admin_list` bypasses ownership (requireSuperAdmin).
 *
 * Server rules mirrored here (aidream is the other writer — keep in lockstep):
 * - slug must match ^[a-z0-9][a-z0-9_-]{0,62}$ (the DB CHECK)
 * - a field_schema containing type 'richtext' is REJECTED when public_write is
 *   true (public visitors never submit rich text — XSS surface)
 * - `client_sites.data_api_key` is generated on first collection create and
 *   rotatable via `rotate_key` ('mk_' + 32 hex). It ships in page HTML — not a
 *   secret; its value is revocation + attribution.
 */

import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createMainSupabaseClient } from "@/utils/supabase/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import {
  getCmsClient,
  verifySiteOwnership,
  verifyCollectionOwnership,
} from "../_lib/cmsDb";
import { logCmsActivity } from "../_lib/activityLog";
import type {
  CollectionFieldDef,
  CollectionFieldType,
  CollectionItemFilter,
  SiteCollection,
} from "@/features/cms/types";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

const FIELD_TYPES: readonly CollectionFieldType[] = [
  "text",
  "richtext",
  "number",
  "boolean",
  "email",
  "url",
  "datetime",
  "select",
  "json",
];

const EXPORT_CAP = 10_000;
/** Cap for the in-route ilike fallback on non-searchable collections. */
const SEARCH_SCAN_CAP = 2_000;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;

function isFieldType(v: unknown): v is CollectionFieldType {
  return typeof v === "string" && (FIELD_TYPES as readonly string[]).includes(v);
}

/**
 * Ingress validation for `field_schema` — it is validator DATA the my-matrx
 * public route interprets, so a malformed array must never land in the DB.
 */
function parseFieldSchema(
  raw: unknown,
): { ok: true; fields: CollectionFieldDef[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "fieldSchema must be an array of field definitions" };
  }
  const fields: CollectionFieldDef[] = [];
  const seen = new Set<string>();
  for (const [i, entry] of raw.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return { ok: false, error: `fieldSchema[${i}] must be an object` };
    }
    const rec = entry as Record<string, unknown>;
    const key = rec.key;
    const label = rec.label;
    const type = rec.type;
    if (typeof key !== "string" || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/.test(key)) {
      return { ok: false, error: `fieldSchema[${i}].key is missing or invalid` };
    }
    if (seen.has(key)) {
      return { ok: false, error: `fieldSchema has a duplicate key "${key}"` };
    }
    seen.add(key);
    if (typeof label !== "string" || !label.trim()) {
      return { ok: false, error: `fieldSchema[${i}].label is required` };
    }
    if (!isFieldType(type)) {
      return {
        ok: false,
        error: `fieldSchema[${i}].type must be one of: ${FIELD_TYPES.join(", ")}`,
      };
    }
    const field: CollectionFieldDef = { key, label: label.trim(), type };
    if (rec.required !== undefined) {
      if (typeof rec.required !== "boolean") {
        return { ok: false, error: `fieldSchema[${i}].required must be a boolean` };
      }
      field.required = rec.required;
    }
    for (const numKey of ["max_length", "min", "max"] as const) {
      const v = rec[numKey];
      if (v !== undefined && v !== null && v !== "") {
        if (typeof v !== "number" || !Number.isFinite(v)) {
          return { ok: false, error: `fieldSchema[${i}].${numKey} must be a number` };
        }
        field[numKey] = v;
      }
    }
    if (rec.options !== undefined) {
      if (
        !Array.isArray(rec.options) ||
        rec.options.some((o) => typeof o !== "string")
      ) {
        return {
          ok: false,
          error: `fieldSchema[${i}].options must be an array of strings`,
        };
      }
      field.options = rec.options as string[];
    }
    fields.push(field);
  }
  return { ok: true, fields };
}

/** The server rule: public visitors never submit rich text. */
function richtextPublicWriteError(
  fields: CollectionFieldDef[],
  publicWrite: boolean,
): string | null {
  if (!publicWrite) return null;
  const offender = fields.find((f) => f.type === "richtext");
  if (!offender) return null;
  return `Field "${offender.key}" is type richtext — a collection with a richtext field cannot allow public writes. Turn off public write or change the field type.`;
}

function mintDataApiKey(): string {
  return `mk_${randomBytes(16).toString("hex")}`;
}

/** Item filter vocabulary → query predicates (matches the viewer tabs). */
function applyItemFilter<
  Q extends {
    eq: (c: string, v: unknown) => Q;
    is: (c: string, v: null) => Q;
  },
>(query: Q, filter: CollectionItemFilter): Q {
  switch (filter) {
    case "unread":
      return query
        .is("deleted_at", null)
        .eq("is_spam", false)
        .eq("status", "active")
        .is("seen_at", null);
    case "spam":
      return query.is("deleted_at", null).eq("is_spam", true);
    case "archived":
      return query
        .is("deleted_at", null)
        .eq("is_spam", false)
        .eq("status", "archived");
    case "all":
    default:
      return query.is("deleted_at", null).eq("is_spam", false).eq("status", "active");
  }
}

function resolveItemFilter(raw: unknown): CollectionItemFilter {
  return raw === "unread" || raw === "spam" || raw === "archived"
    ? raw
    : "all";
}

/**
 * Verify every item id belongs to a site the user owns. Returns the rows
 * (id, collection_id, client_id) on success so callers can log per collection.
 */
async function verifyItemsOwnership(
  db: SupabaseClient,
  itemIds: string[],
  userId: string,
): Promise<
  | { ok: true; items: { id: string; collection_id: string; client_id: string }[] }
  | { ok: false }
> {
  const { data: items, error } = await db
    .from("site_collection_items")
    .select("id, collection_id, client_id")
    .in("id", itemIds);
  if (error || !items || items.length !== itemIds.length) return { ok: false };
  const clientIds = [...new Set(items.map((i) => i.client_id as string))];
  for (const clientId of clientIds) {
    if (!(await verifySiteOwnership(db, clientId, userId))) return { ok: false };
  }
  return {
    ok: true,
    items: items as { id: string; collection_id: string; client_id: string }[],
  };
}

export async function POST(request: NextRequest) {
  try {
    const mainSupabase = await createMainSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await mainSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...params } = body;
    const db = getCmsClient();

    switch (action) {
      // ── List a site's collections (with live counts) ───────────────
      case "list": {
        const { siteId, includeDeleted } = params;
        if (!siteId) {
          return NextResponse.json({ error: "siteId is required" }, { status: 400 });
        }
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        let query = db
          .from("site_collections")
          .select("*")
          .eq("client_id", siteId)
          .order("created_at", { ascending: false });
        if (!includeDeleted) query = query.is("deleted_at", null);

        const { data, error } = await query;
        if (error) {
          console.error("[cms/collections] list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Counts ride the 0015 partial indexes — cheap head counts.
        const collections = await Promise.all(
          (data ?? []).map(async (c) => {
            const [{ count: itemCount }, { count: unreadCount }] =
              await Promise.all([
                db
                  .from("site_collection_items")
                  .select("id", { count: "exact", head: true })
                  .eq("collection_id", c.id)
                  .eq("is_spam", false)
                  .is("deleted_at", null)
                  .eq("status", "active"),
                db
                  .from("site_collection_items")
                  .select("id", { count: "exact", head: true })
                  .eq("collection_id", c.id)
                  .eq("is_spam", false)
                  .is("deleted_at", null)
                  .is("seen_at", null),
              ]);
            return {
              ...c,
              item_count: itemCount ?? 0,
              unread_count: unreadCount ?? 0,
            };
          }),
        );

        return NextResponse.json({ collections });
      }

      // ── Get one collection ──────────────────────────────────────────
      case "get": {
        const { collectionId } = params;
        if (!collectionId) {
          return NextResponse.json(
            { error: "collectionId is required" },
            { status: 400 },
          );
        }
        if (!(await verifyCollectionOwnership(db, collectionId, user.id))) {
          return NextResponse.json(
            { error: "Collection not found or access denied" },
            { status: 403 },
          );
        }
        const { data, error } = await db
          .from("site_collections")
          .select("*")
          .eq("id", collectionId)
          .single();
        if (error) {
          console.error("[cms/collections] get error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ collection: data });
      }

      // ── Create ──────────────────────────────────────────────────────
      case "create": {
        const {
          siteId,
          slug,
          name,
          description,
          fieldSchema,
          validationMode,
          publicWrite,
          publicRead,
          publicReadFields,
          allowUpsert,
          searchable,
          settings,
        } = params;

        if (!siteId || !slug || !name) {
          return NextResponse.json(
            { error: "siteId, slug, and name are required" },
            { status: 400 },
          );
        }
        if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
          return NextResponse.json(
            {
              error:
                "slug must be lowercase letters/digits, then letters/digits/underscores/hyphens (max 63 chars)",
            },
            { status: 400 },
          );
        }
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }

        const parsed = parseFieldSchema(fieldSchema ?? []);
        if (!parsed.ok) {
          return NextResponse.json({ error: parsed.error }, { status: 400 });
        }
        const richtextError = richtextPublicWriteError(
          parsed.fields,
          publicWrite === true,
        );
        if (richtextError) {
          return NextResponse.json({ error: richtextError }, { status: 400 });
        }

        const row: Record<string, unknown> = {
          client_id: siteId,
          slug,
          name,
          description: description || null,
          field_schema: parsed.fields,
          validation_mode: validationMode === "strict" ? "strict" : "advisory",
          public_write: publicWrite === true,
          public_read: publicRead === true,
          public_read_fields: Array.isArray(publicReadFields)
            ? publicReadFields.filter((f: unknown) => typeof f === "string")
            : [],
          allow_upsert: allowUpsert === true,
          searchable: searchable === true,
          settings:
            typeof settings === "object" && settings !== null ? settings : {},
          created_by: user.id,
        };

        const { data, error } = await db
          .from("site_collections")
          .insert(row)
          .select()
          .single();
        if (error) {
          console.error("[cms/collections] create error:", error);
          const status = error.code === "23505" ? 409 : 500;
          return NextResponse.json(
            {
              error:
                error.code === "23505"
                  ? `A collection with slug "${slug}" already exists on this site`
                  : error.message,
            },
            { status },
          );
        }

        // First collection on the site mints the site data key (design §5.3).
        let mintedKey: string | null = null;
        const { data: siteRow } = await db
          .from("client_sites")
          .select("data_api_key")
          .eq("id", siteId)
          .single();
        if (siteRow && !siteRow.data_api_key) {
          mintedKey = mintDataApiKey();
          const { error: keyError } = await db
            .from("client_sites")
            .update({ data_api_key: mintedKey })
            .eq("id", siteId);
          if (keyError) {
            console.error(
              "[cms/collections] data_api_key mint FAILED for site",
              siteId,
              keyError,
            );
            mintedKey = null;
          }
        }

        await logCmsActivity(db, {
          siteId,
          activityType: "collection.create",
          entityType: "collection",
          entityId: data.id,
          description: `Created collection "${data.name}" (${data.slug})`,
          userId: user.id,
          userEmail: user.email,
          changes: {
            field_count: parsed.fields.length,
            public_write: row.public_write,
            public_read: row.public_read,
            ...(mintedKey ? { minted_data_api_key: true } : {}),
          },
        });

        return NextResponse.json({
          success: true,
          collection: data,
          mintedDataApiKey: mintedKey !== null,
        });
      }

      // ── Update ──────────────────────────────────────────────────────
      case "update": {
        const { collectionId, ...updateFields } = params;
        if (!collectionId) {
          return NextResponse.json(
            { error: "collectionId is required" },
            { status: 400 },
          );
        }
        if (!(await verifyCollectionOwnership(db, collectionId, user.id))) {
          return NextResponse.json(
            { error: "Collection not found or access denied" },
            { status: 403 },
          );
        }

        const { data: current, error: currentError } = await db
          .from("site_collections")
          .select("*")
          .eq("id", collectionId)
          .single();
        if (currentError || !current) {
          return NextResponse.json(
            { error: "Collection not found" },
            { status: 404 },
          );
        }
        const currentRow = current as SiteCollection;

        const updateData: Record<string, unknown> = {};

        if (updateFields.slug !== undefined) {
          if (
            typeof updateFields.slug !== "string" ||
            !SLUG_RE.test(updateFields.slug)
          ) {
            return NextResponse.json(
              {
                error:
                  "slug must be lowercase letters/digits, then letters/digits/underscores/hyphens (max 63 chars)",
              },
              { status: 400 },
            );
          }
          updateData.slug = updateFields.slug;
        }
        if (updateFields.name !== undefined) updateData.name = updateFields.name;
        if (updateFields.description !== undefined)
          updateData.description = updateFields.description || null;
        if (updateFields.validationMode !== undefined)
          updateData.validation_mode =
            updateFields.validationMode === "strict" ? "strict" : "advisory";
        if (updateFields.publicWrite !== undefined)
          updateData.public_write = updateFields.publicWrite === true;
        if (updateFields.publicRead !== undefined)
          updateData.public_read = updateFields.publicRead === true;
        if (updateFields.publicReadFields !== undefined)
          updateData.public_read_fields = Array.isArray(
            updateFields.publicReadFields,
          )
            ? updateFields.publicReadFields.filter(
                (f: unknown) => typeof f === "string",
              )
            : [];
        if (updateFields.allowUpsert !== undefined)
          updateData.allow_upsert = updateFields.allowUpsert === true;
        if (updateFields.searchable !== undefined)
          updateData.searchable = updateFields.searchable === true;
        if (updateFields.settings !== undefined)
          updateData.settings =
            typeof updateFields.settings === "object" &&
            updateFields.settings !== null
              ? updateFields.settings
              : {};
        if (updateFields.status !== undefined) {
          if (updateFields.status !== "active" && updateFields.status !== "archived") {
            return NextResponse.json(
              { error: "status must be 'active' or 'archived'" },
              { status: 400 },
            );
          }
          updateData.status = updateFields.status;
        }

        let effectiveFields = currentRow.field_schema;
        if (updateFields.fieldSchema !== undefined) {
          const parsed = parseFieldSchema(updateFields.fieldSchema);
          if (!parsed.ok) {
            return NextResponse.json({ error: parsed.error }, { status: 400 });
          }
          updateData.field_schema = parsed.fields;
          effectiveFields = parsed.fields;
        }

        if (Object.keys(updateData).length === 0) {
          return NextResponse.json(
            { error: "No fields to update" },
            { status: 400 },
          );
        }

        // The richtext × public_write rule holds on the MERGED result.
        const effectivePublicWrite =
          updateData.public_write !== undefined
            ? updateData.public_write === true
            : currentRow.public_write;
        const richtextError = richtextPublicWriteError(
          effectiveFields,
          effectivePublicWrite,
        );
        if (richtextError) {
          return NextResponse.json({ error: richtextError }, { status: 400 });
        }

        const { data, error } = await db
          .from("site_collections")
          .update(updateData)
          .eq("id", collectionId)
          .select()
          .single();
        if (error) {
          console.error("[cms/collections] update error:", error);
          const status = error.code === "23505" ? 409 : 500;
          return NextResponse.json(
            {
              error:
                error.code === "23505"
                  ? `A collection with that slug already exists on this site`
                  : error.message,
            },
            { status },
          );
        }

        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "collection.update",
          entityType: "collection",
          entityId: collectionId,
          description: `Updated collection "${data.name}" (${Object.keys(updateData).join(", ")})`,
          userId: user.id,
          userEmail: user.email,
          changes: { fields: Object.keys(updateData) },
        });

        return NextResponse.json({ success: true, collection: data });
      }

      // ── Archive (definition stops accepting writes; items kept) ─────
      case "archive": {
        const { collectionId } = params;
        if (!collectionId) {
          return NextResponse.json(
            { error: "collectionId is required" },
            { status: 400 },
          );
        }
        if (!(await verifyCollectionOwnership(db, collectionId, user.id))) {
          return NextResponse.json(
            { error: "Collection not found or access denied" },
            { status: 403 },
          );
        }
        const { data, error } = await db
          .from("site_collections")
          .update({ status: "archived" })
          .eq("id", collectionId)
          .select()
          .single();
        if (error) {
          console.error("[cms/collections] archive error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "collection.archive",
          entityType: "collection",
          entityId: collectionId,
          description: `Archived collection "${data.name}"`,
          userId: user.id,
          userEmail: user.email,
        });
        return NextResponse.json({ success: true, collection: data });
      }

      // ── Delete (soft — deleted_at; items survive under the FK) ──────
      case "delete": {
        const { collectionId } = params;
        if (!collectionId) {
          return NextResponse.json(
            { error: "collectionId is required" },
            { status: 400 },
          );
        }
        if (!(await verifyCollectionOwnership(db, collectionId, user.id))) {
          return NextResponse.json(
            { error: "Collection not found or access denied" },
            { status: 403 },
          );
        }
        const { data, error } = await db
          .from("site_collections")
          .update({ deleted_at: new Date().toISOString(), status: "archived" })
          .eq("id", collectionId)
          .select()
          .single();
        if (error) {
          console.error("[cms/collections] delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "collection.delete",
          entityType: "collection",
          entityId: collectionId,
          description: `Deleted collection "${data.name}" (${data.slug})`,
          userId: user.id,
          userEmail: user.email,
        });
        return NextResponse.json({ success: true });
      }

      // ── Rotate the site data key (kill-switch) ──────────────────────
      case "rotate_key": {
        const { siteId } = params;
        if (!siteId) {
          return NextResponse.json({ error: "siteId is required" }, { status: 400 });
        }
        if (!(await verifySiteOwnership(db, siteId, user.id))) {
          return NextResponse.json(
            { error: "Site not found or access denied" },
            { status: 403 },
          );
        }
        const newKey = mintDataApiKey();
        const { data, error } = await db
          .from("client_sites")
          .update({ data_api_key: newKey })
          .eq("id", siteId)
          .select("id, name, data_api_key")
          .single();
        if (error) {
          console.error("[cms/collections] rotate_key error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logCmsActivity(db, {
          siteId,
          activityType: "site.rotate_data_key",
          entityType: "site",
          entityId: siteId,
          description: `Rotated the site data key for "${data.name}"`,
          userId: user.id,
          userEmail: user.email,
        });
        return NextResponse.json({ success: true, dataApiKey: data.data_api_key });
      }

      // ── Items: paged list with filters + search ─────────────────────
      case "items_list": {
        const { collectionId, q } = params;
        if (!collectionId) {
          return NextResponse.json(
            { error: "collectionId is required" },
            { status: 400 },
          );
        }
        if (!(await verifyCollectionOwnership(db, collectionId, user.id))) {
          return NextResponse.json(
            { error: "Collection not found or access denied" },
            { status: 403 },
          );
        }

        const filter = resolveItemFilter(params.filter);
        const page = Math.max(1, Number(params.page) || 1);
        const perPage = Math.min(
          MAX_PER_PAGE,
          Math.max(1, Number(params.perPage) || DEFAULT_PER_PAGE),
        );
        const search = typeof q === "string" ? q.trim() : "";

        const { data: collection } = await db
          .from("site_collections")
          .select("searchable")
          .eq("id", collectionId)
          .single();

        // Non-searchable collections have no tsvector — PostgREST cannot
        // ilike a jsonb column, so the fallback scans a capped window in the
        // route. Bounded (SEARCH_SCAN_CAP) and reported via `searchTruncated`.
        if (search && !collection?.searchable) {
          let scanQuery = db
            .from("site_collection_items")
            .select("*")
            .eq("collection_id", collectionId);
          scanQuery = applyItemFilter(scanQuery, filter);
          const { data: scanned, error: scanError } = await scanQuery
            .order("created_at", { ascending: false })
            .limit(SEARCH_SCAN_CAP);
          if (scanError) {
            console.error("[cms/collections] items_list scan error:", scanError);
            return NextResponse.json(
              { error: scanError.message },
              { status: 500 },
            );
          }
          const needle = search.toLowerCase();
          const matched = (scanned ?? []).filter((row) =>
            JSON.stringify(row.data ?? {}).toLowerCase().includes(needle),
          );
          const start = (page - 1) * perPage;
          return NextResponse.json({
            items: matched.slice(start, start + perPage),
            total: matched.length,
            page,
            perPage,
            searchTruncated: (scanned ?? []).length === SEARCH_SCAN_CAP,
          });
        }

        let query = db
          .from("site_collection_items")
          .select("*", { count: "exact" })
          .eq("collection_id", collectionId);
        query = applyItemFilter(query, filter);
        if (search) {
          query = query.textSearch("search_vector", search, {
            type: "websearch",
            config: "english",
          });
        }
        const from = (page - 1) * perPage;
        const { data, error, count } = await query
          .order("created_at", { ascending: false })
          .range(from, from + perPage - 1);
        if (error) {
          console.error("[cms/collections] items_list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({
          items: data ?? [],
          total: count ?? 0,
          page,
          perPage,
          searchTruncated: false,
        });
      }

      // ── Items: single row ────────────────────────────────────────────
      case "items_get": {
        const { itemId } = params;
        if (!itemId) {
          return NextResponse.json(
            { error: "itemId is required" },
            { status: 400 },
          );
        }
        const owned = await verifyItemsOwnership(db, [itemId], user.id);
        if (!owned.ok) {
          return NextResponse.json(
            { error: "Item not found or access denied" },
            { status: 403 },
          );
        }
        const { data, error } = await db
          .from("site_collection_items")
          .select("*")
          .eq("id", itemId)
          .single();
        if (error) {
          console.error("[cms/collections] items_get error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ item: data });
      }

      // ── Items: triage flags (seen / spam / archive) — row or bulk ────
      case "items_set_flags": {
        const { itemIds, seen, isSpam, status } = params;
        const ids: string[] = Array.isArray(itemIds)
          ? itemIds.filter((v: unknown): v is string => typeof v === "string")
          : [];
        if (ids.length === 0) {
          return NextResponse.json(
            { error: "itemIds (non-empty array) is required" },
            { status: 400 },
          );
        }
        const flagUpdate: Record<string, unknown> = {};
        if (seen !== undefined)
          flagUpdate.seen_at = seen ? new Date().toISOString() : null;
        if (isSpam !== undefined) flagUpdate.is_spam = isSpam === true;
        if (status !== undefined) {
          if (status !== "active" && status !== "archived") {
            return NextResponse.json(
              { error: "status must be 'active' or 'archived'" },
              { status: 400 },
            );
          }
          flagUpdate.status = status;
        }
        if (Object.keys(flagUpdate).length === 0) {
          return NextResponse.json(
            { error: "Nothing to set — pass seen, isSpam, and/or status" },
            { status: 400 },
          );
        }

        const owned = await verifyItemsOwnership(db, ids, user.id);
        if (!owned.ok) {
          return NextResponse.json(
            { error: "One or more items not found or access denied" },
            { status: 403 },
          );
        }

        const { data, error } = await db
          .from("site_collection_items")
          .update(flagUpdate)
          .in("id", ids)
          .select();
        if (error) {
          console.error("[cms/collections] items_set_flags error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Seen-marking is triage noise — log spam/status changes only.
        if (isSpam !== undefined || status !== undefined) {
          await logCmsActivity(db, {
            siteId: owned.items[0]?.client_id ?? null,
            activityType: "collection_item.set_flags",
            entityType: "collection_item",
            entityId: ids.length === 1 ? ids[0] : null,
            description: `Updated flags on ${ids.length} item(s) (${Object.keys(flagUpdate).join(", ")})`,
            userId: user.id,
            userEmail: user.email,
            changes: { item_ids: ids, ...flagUpdate },
          });
        }

        return NextResponse.json({ success: true, items: data ?? [] });
      }

      // ── Items: soft delete — row or bulk ─────────────────────────────
      case "items_delete": {
        const { itemIds } = params;
        const ids: string[] = Array.isArray(itemIds)
          ? itemIds.filter((v: unknown): v is string => typeof v === "string")
          : [];
        if (ids.length === 0) {
          return NextResponse.json(
            { error: "itemIds (non-empty array) is required" },
            { status: 400 },
          );
        }
        const owned = await verifyItemsOwnership(db, ids, user.id);
        if (!owned.ok) {
          return NextResponse.json(
            { error: "One or more items not found or access denied" },
            { status: 403 },
          );
        }
        const { error } = await db
          .from("site_collection_items")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", ids);
        if (error) {
          console.error("[cms/collections] items_delete error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        await logCmsActivity(db, {
          siteId: owned.items[0]?.client_id ?? null,
          activityType: "collection_item.delete",
          entityType: "collection_item",
          entityId: ids.length === 1 ? ids[0] : null,
          description: `Deleted ${ids.length} collection item(s)`,
          userId: user.id,
          userEmail: user.email,
          changes: { item_ids: ids },
        });
        return NextResponse.json({ success: true });
      }

      // ── Items: export rows (client assembles the CSV) ────────────────
      case "items_export": {
        const { collectionId } = params;
        if (!collectionId) {
          return NextResponse.json(
            { error: "collectionId is required" },
            { status: 400 },
          );
        }
        if (!(await verifyCollectionOwnership(db, collectionId, user.id))) {
          return NextResponse.json(
            { error: "Collection not found or access denied" },
            { status: 403 },
          );
        }
        const filter = resolveItemFilter(params.filter);
        let query = db
          .from("site_collection_items")
          .select("*")
          .eq("collection_id", collectionId);
        query = applyItemFilter(query, filter);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(EXPORT_CAP);
        if (error) {
          console.error("[cms/collections] items_export error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({
          items: data ?? [],
          truncated: (data ?? []).length === EXPORT_CAP,
          cap: EXPORT_CAP,
        });
      }

      // ── Admin: fleet-wide collection read, requireSuperAdmin ─────────
      case "admin_list": {
        await requireSuperAdmin();
        const { siteId } = params;
        let query = db
          .from("site_collections")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (siteId) query = query.eq("client_id", siteId);
        const { data, error } = await query;
        if (error) {
          console.error("[cms/collections] admin_list error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ collections: data ?? [] });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 },
        );
    }
  } catch (err: unknown) {
    console.error("[cms/collections] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.startsWith("Forbidden")
      ? 403
      : message.startsWith("Unauthorized")
        ? 401
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
