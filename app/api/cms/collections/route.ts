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
import {
  validateItem,
  itemByteSize,
  countKeys,
} from "@/features/cms/collections/validateItem";
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
/**
 * Byte budget for an export response. Vercel caps a function response at
 * 4.5 MB — a row cap alone does not bound `data` (unbounded jsonb), so the
 * CSV button dies on any real inbox without this. We stop well short and tell
 * the admin to narrow the filter (mirrors aidream CONTRACT.md §CW2
 * `CmsExportTooLarge`).
 */
const EXPORT_BYTE_BUDGET = 3_500_000;
/** Rows per round-trip while accumulating an export — keeps peak memory flat. */
const EXPORT_CHUNK = 500;
/** Cap for the in-route scan fallback on non-searchable collections. */
const SEARCH_SCAN_CAP = 2_000;
/** Memory budget for that same scan — 2,000 fat rows would otherwise OOM. */
const SEARCH_SCAN_BYTE_BUDGET = 8_000_000;
/** Ceiling handed to `backfill_collection_search_vectors`. */
const SEARCH_BACKFILL_CAP = 50_000;
const DEFAULT_PER_PAGE = 50;
const MAX_PER_PAGE = 200;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2_000;
/** Bulk triage/delete batch ceiling — beyond this PostgREST 500s opaquely. */
const MAX_ITEM_IDS = 500;

/**
 * Every item column EXCEPT `search_vector`. The tsvector is server-side index
 * weight (routinely larger than the row itself) and no surface renders it —
 * `select("*")` shipped it into lambda memory on every list, scan and export.
 */
const ITEM_COLUMNS =
  "id, collection_id, client_id, data, idempotency_key, submitted_by, source_url, ip_address, user_agent, is_spam, seen_at, status, deleted_at, created_at, updated_at";

/** Columns the export CSV actually consumes (`buildCsv` in the items page). */
const EXPORT_COLUMNS =
  "id, data, created_at, status, is_spam, seen_at, source_url";

function isFieldType(v: unknown): v is CollectionFieldType {
  return typeof v === "string" && (FIELD_TYPES as readonly string[]).includes(v);
}

/**
 * Item payload caps — the ROUTE is the size authority (CW3: "size caps are
 * CALLER-enforced"). These mirror my-matrx's visitor route exactly, so an
 * admin-authored item is bounded identically to a visitor-submitted one.
 */
const MAX_ITEM_BYTES = 65_536;
/** Hard ceiling on the settings.max_item_bytes override (512 KB). */
const MAX_ITEM_BYTES_CEILING = 524_288;
/** Keys after flatten — not overridable. */
const MAX_ITEM_FIELDS = 200;
/** settings.max_items — quota QUARANTINE (archived), never a rejection. */
const MAX_ITEMS = 100_000;

/** Non-empty string param, or null. */
function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/** Positive-integer setting override with default + optional hard ceiling. */
function intSetting(
  settings: unknown,
  key: string,
  fallback: number,
  ceiling: number | null = null,
): number {
  const raw = isPlainObject(settings) ? settings[key] : undefined;
  const value = Number.isInteger(raw) && (raw as number) > 0 ? (raw as number) : fallback;
  return ceiling !== null ? Math.min(value, ceiling) : value;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Shape + size gate for an incoming item `data` payload, shared by
 * items_create and items_update. Returns the payload ready to store.
 */
function prepareItemData(
  raw: unknown,
  settings: unknown,
):
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number } {
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      error: "data must be a JSON object of field values",
      status: 400,
    };
  }
  const maxBytes = intSetting(
    settings,
    "max_item_bytes",
    MAX_ITEM_BYTES,
    MAX_ITEM_BYTES_CEILING,
  );
  const size = itemByteSize(raw);
  if (size > maxBytes) {
    return {
      ok: false,
      error: `This item is ${size.toLocaleString()} bytes — the limit for this collection is ${maxBytes.toLocaleString()}. Shorten a long field.`,
      status: 413,
    };
  }
  if (countKeys(raw) > MAX_ITEM_FIELDS) {
    return {
      ok: false,
      error: `This item has more than ${MAX_ITEM_FIELDS} keys (counted through nested objects).`,
      status: 413,
    };
  }
  return { ok: true, data: raw };
}

function validateName(
  v: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof v !== "string") {
    return { ok: false, error: "name must be a string" };
  }
  const value = v.trim();
  if (!value) return { ok: false, error: "name is required" };
  if (value.length > MAX_NAME_LENGTH) {
    return {
      ok: false,
      error: `name must be ${MAX_NAME_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, value };
}

function validateDescription(
  v: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "string") {
    return { ok: false, error: "description must be a string" };
  }
  const value = v.trim();
  if (value.length > MAX_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer`,
    };
  }
  return { ok: true, value: value || null };
}

/**
 * Dedupe + cap an incoming id array. Duplicates used to produce a FALSE 403:
 * `.in()` dedupes server-side, so `items.length !== itemIds.length` failed the
 * ownership check on a payload the user legitimately owned.
 */
function normalizeItemIds(
  raw: unknown,
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, error: "itemIds (non-empty array) is required" };
  }
  if (raw.length > MAX_ITEM_IDS) {
    return {
      ok: false,
      error: `itemIds accepts at most ${MAX_ITEM_IDS} ids per request — send them in batches`,
    };
  }
  const ids = [
    ...new Set(raw.filter((v: unknown): v is string => typeof v === "string")),
  ];
  if (ids.length === 0) {
    return { ok: false, error: "itemIds (non-empty array) is required" };
  }
  return { ok: true, ids };
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
      const options = rec.options.filter(
        (o: unknown): o is string => typeof o === "string" && o.trim() !== "",
      );
      if (options.length === 0) {
        return {
          ok: false,
          error: `fieldSchema[${i}].options must contain at least one option`,
        };
      }
      field.options = options;
    }
    // Twin parity with the editor dialog: a `select` with no options can never
    // validate under strict mode, so it must never be accepted here either.
    if (type === "select" && !field.options) {
      return {
        ok: false,
        error: `fieldSchema[${i}] is a select field and needs at least one option`,
      };
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object" },
        { status: 400 },
      );
    }

    const { action, ...params } = body as Record<string, unknown>;
    const db = getCmsClient();

    switch (action) {
      // ── List a site's collections (with live counts) ───────────────
      case "list": {
        const siteId = asString(params.siteId);
        const includeDeleted = params.includeDeleted === true;
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
                // `status = 'active'` is REQUIRED here — `applyItemFilter`'s
                // "unread" case includes it, so omitting it inflated the "N new"
                // badge with archived-unseen rows the Unread tab never shows.
                db
                  .from("site_collection_items")
                  .select("id", { count: "exact", head: true })
                  .eq("collection_id", c.id)
                  .eq("is_spam", false)
                  .is("deleted_at", null)
                  .eq("status", "active")
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
        const collectionId = asString(params.collectionId);
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
          fieldSchema,
          validationMode,
          publicWrite,
          publicRead,
          publicReadFields,
          allowUpsert,
          searchable,
          settings,
        } = params;
        const siteId = asString(params.siteId);
        const slug = asString(params.slug);

        if (!siteId || !slug || params.name === undefined) {
          return NextResponse.json(
            { error: "siteId, slug, and name are required" },
            { status: 400 },
          );
        }
        const parsedName = validateName(params.name);
        if (!parsedName.ok) {
          return NextResponse.json({ error: parsedName.error }, { status: 400 });
        }
        const parsedDescription = validateDescription(params.description);
        if (!parsedDescription.ok) {
          return NextResponse.json(
            { error: parsedDescription.error },
            { status: 400 },
          );
        }
        if (!SLUG_RE.test(slug)) {
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
          name: parsedName.value,
          description: parsedDescription.value,
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
        const { collectionId: rawCollectionId, ...updateFields } = params;
        const collectionId = asString(rawCollectionId);
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
        if (updateFields.name !== undefined) {
          const parsedName = validateName(updateFields.name);
          if (!parsedName.ok) {
            return NextResponse.json(
              { error: parsedName.error },
              { status: 400 },
            );
          }
          updateData.name = parsedName.value;
        }
        if (updateFields.description !== undefined) {
          const parsedDescription = validateDescription(
            updateFields.description,
          );
          if (!parsedDescription.ok) {
            return NextResponse.json(
              { error: parsedDescription.error },
              { status: 400 },
            );
          }
          updateData.description = parsedDescription.value;
        }
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

        /**
         * Flipping `searchable` false→true does NOT vectorize the rows that
         * already exist: the tsvector trigger only fires on insert / UPDATE OF
         * data, while `items_list` routes on the flag — so search silently
         * returned zero for rows that were sitting right there. Re-vectorize
         * the backlog through the CMS 0019 RPC.
         */
        let searchBackfill: {
          rows: number;
          truncated: boolean;
          cap: number;
        } | null = null;
        if (updateData.searchable === true && currentRow.searchable === false) {
          const { data: backfilled, error: backfillError } = await db.rpc(
            "backfill_collection_search_vectors",
            { p_collection_id: collectionId, p_max_rows: SEARCH_BACKFILL_CAP },
          );
          if (backfillError) {
            console.error(
              "[cms/collections] search_vector backfill FAILED for collection",
              collectionId,
              "— existing items stay unfindable until this is re-run:",
              backfillError,
            );
            searchBackfill = { rows: 0, truncated: false, cap: SEARCH_BACKFILL_CAP };
          } else {
            const rows = typeof backfilled === "number" ? backfilled : 0;
            const truncated = rows >= SEARCH_BACKFILL_CAP;
            if (truncated) {
              console.error(
                "[cms/collections] search_vector backfill hit the",
                SEARCH_BACKFILL_CAP,
                "row cap for collection",
                collectionId,
                "— older items remain unfindable; re-run the backfill.",
              );
            }
            searchBackfill = { rows, truncated, cap: SEARCH_BACKFILL_CAP };
          }
        }

        await logCmsActivity(db, {
          siteId: data.client_id,
          activityType: "collection.update",
          entityType: "collection",
          entityId: collectionId,
          description: `Updated collection "${data.name}" (${Object.keys(updateData).join(", ")})`,
          userId: user.id,
          userEmail: user.email,
          changes: {
            fields: Object.keys(updateData),
            ...(searchBackfill ? { search_backfill: searchBackfill } : {}),
          },
        });

        return NextResponse.json({
          success: true,
          collection: data,
          ...(searchBackfill ? { searchBackfill } : {}),
        });
      }

      // ── Archive (definition stops accepting writes; items kept) ─────
      case "archive": {
        const collectionId = asString(params.collectionId);
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
        const collectionId = asString(params.collectionId);
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
        const siteId = asString(params.siteId);
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
        const collectionId = asString(params.collectionId);
        const q = params.q;
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
            .select(ITEM_COLUMNS)
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
          const rows = scanned ?? [];
          const matched: typeof rows = [];
          let scanBytes = 0;
          let budgetHit = false;
          for (const row of rows) {
            const serialized = JSON.stringify(row.data ?? {});
            scanBytes += serialized.length;
            if (scanBytes > SEARCH_SCAN_BYTE_BUDGET) {
              budgetHit = true;
              console.warn(
                "[cms/collections] items_list scan hit the byte budget for collection",
                collectionId,
                "— results are partial; enable Searchable for full-text search.",
              );
              break;
            }
            if (serialized.toLowerCase().includes(needle)) matched.push(row);
          }
          const start = (page - 1) * perPage;
          return NextResponse.json({
            items: matched.slice(start, start + perPage),
            // Matches WITHIN the scanned window only — not the collection-wide
            // count. `searchTruncated` says whether that distinction matters.
            total: matched.length,
            page,
            perPage,
            searchTruncated: rows.length >= SEARCH_SCAN_CAP || budgetHit,
          });
        }

        let query = db
          .from("site_collection_items")
          .select(ITEM_COLUMNS, { count: "exact" })
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
        const itemId = asString(params.itemId);
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
          .select(ITEM_COLUMNS)
          .eq("id", itemId)
          .single();
        if (error) {
          console.error("[cms/collections] items_get error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json({ item: data });
      }

      /**
       * ── Items: admin-authored create ──────────────────────────────────
       *
       * Arman's ruling for W2-C is that client sites RENDER collection data
       * (events, testimonials, FAQ entries, practitioner profiles) "curated by
       * a human OR authored by an agent". aidream's collection_item_service
       * had the agent half; this is the human half.
       *
       * NOT the visitor path: we do a plain insert, never
       * `submit_collection_item`. That RPC carries the rate windows, the quota
       * quarantine and — crucially — the `visitor_write_at` stamp that keeps
       * the visitor limiter honest. An admin adding 30 events must not burn
       * the window and 429 the site's public contact form.
       *
       * Admin rows therefore carry NO visitor provenance (no ip_address,
       * user_agent or source_url) and are NEVER marked spam.
       */
      case "items_create": {
        const collectionId = asString(params.collectionId);
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
        const { data: target, error: targetError } = await db
          .from("site_collections")
          .select("id, client_id, name, field_schema, validation_mode, settings, status, deleted_at")
          .eq("id", collectionId)
          .single();
        if (targetError || !target) {
          return NextResponse.json(
            { error: "Collection not found" },
            { status: 404 },
          );
        }
        if (target.deleted_at) {
          return NextResponse.json(
            { error: "This collection has been deleted" },
            { status: 400 },
          );
        }

        const prepared = prepareItemData(params.data, target.settings);
        if (!prepared.ok) {
          return NextResponse.json(
            { error: prepared.error },
            { status: prepared.status },
          );
        }

        const report = validateItem(
          target.field_schema,
          prepared.data,
          target.validation_mode === "strict" ? "strict" : "advisory",
        );
        if (!report.ok) {
          return NextResponse.json(
            {
              error: "This item does not match the collection's field rules",
              validationErrors: report.errors,
              validationWarnings: report.warnings,
            },
            { status: 422 },
          );
        }

        /**
         * Quota quarantine, mirroring the service contract: at
         * `settings.max_items` the row lands `status='archived'` — it is NEVER
         * rejected. Losing an admin's authored content to a quota would be
         * worse than parking it.
         */
        const maxItems = intSetting(target.settings, "max_items", MAX_ITEMS);
        const { count: liveCount } = await db
          .from("site_collection_items")
          .select("id", { count: "exact", head: true })
          .eq("collection_id", collectionId)
          .eq("is_spam", false)
          .is("deleted_at", null)
          .eq("status", "active");
        const quarantined = (liveCount ?? 0) >= maxItems;

        const { data: created, error: createError } = await db
          .from("site_collection_items")
          .insert({
            collection_id: collectionId,
            client_id: target.client_id,
            data: prepared.data,
            status: quarantined ? "archived" : "active",
            // Admin-authored: no visitor provenance, never spam, and seen by
            // definition — the person who wrote it has obviously read it.
            is_spam: false,
            seen_at: new Date().toISOString(),
            submitted_by: user.id,
          })
          .select(ITEM_COLUMNS)
          .single();
        if (createError) {
          console.error("[cms/collections] items_create error:", createError);
          return NextResponse.json(
            { error: createError.message },
            { status: 500 },
          );
        }
        if (quarantined) {
          console.warn(
            "[cms/collections] items_create QUARANTINED a row for collection",
            collectionId,
            `— live items (${liveCount}) reached settings.max_items (${maxItems}); it landed archived.`,
          );
        }

        await logCmsActivity(db, {
          siteId: target.client_id,
          activityType: "collection_item.create",
          entityType: "collection_item",
          entityId: created.id,
          description: `Authored an item in collection "${target.name}"`,
          userId: user.id,
          userEmail: user.email,
          changes: {
            keys: Object.keys(prepared.data),
            ...(quarantined ? { quarantined: true } : {}),
            ...(report.warnings.length > 0
              ? { validation_warnings: report.warnings.length }
              : {}),
          },
        });

        return NextResponse.json({
          success: true,
          item: created,
          quarantined,
          validationWarnings: report.warnings,
        });
      }

      // ── Items: admin edit of one item's data (fix a typo) ─────────────
      case "items_update": {
        const itemId = asString(params.itemId);
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
        const { data: parent, error: parentError } = await db
          .from("site_collections")
          .select("id, client_id, name, field_schema, validation_mode, settings")
          .eq("id", owned.items[0].collection_id)
          .single();
        if (parentError || !parent) {
          return NextResponse.json(
            { error: "Collection not found" },
            { status: 404 },
          );
        }

        const prepared = prepareItemData(params.data, parent.settings);
        if (!prepared.ok) {
          return NextResponse.json(
            { error: prepared.error },
            { status: prepared.status },
          );
        }

        const report = validateItem(
          parent.field_schema,
          prepared.data,
          parent.validation_mode === "strict" ? "strict" : "advisory",
        );
        if (!report.ok) {
          return NextResponse.json(
            {
              error: "This item does not match the collection's field rules",
              validationErrors: report.errors,
              validationWarnings: report.warnings,
            },
            { status: 422 },
          );
        }

        // `data` only — an edit never rewrites provenance, flags or timestamps.
        const { data: updated, error: updateError } = await db
          .from("site_collection_items")
          .update({ data: prepared.data })
          .eq("id", itemId)
          .select(ITEM_COLUMNS)
          .single();
        if (updateError) {
          console.error("[cms/collections] items_update error:", updateError);
          return NextResponse.json(
            { error: updateError.message },
            { status: 500 },
          );
        }

        await logCmsActivity(db, {
          siteId: parent.client_id,
          activityType: "collection_item.update",
          entityType: "collection_item",
          entityId: itemId,
          description: `Edited an item in collection "${parent.name}"`,
          userId: user.id,
          userEmail: user.email,
          changes: {
            keys: Object.keys(prepared.data),
            ...(report.warnings.length > 0
              ? { validation_warnings: report.warnings.length }
              : {}),
          },
        });

        return NextResponse.json({
          success: true,
          item: updated,
          validationWarnings: report.warnings,
        });
      }

      // ── Items: triage flags (seen / spam / archive) — row or bulk ────
      case "items_set_flags": {
        const { seen, isSpam, status } = params;
        const normalized = normalizeItemIds(params.itemIds);
        if (!normalized.ok) {
          return NextResponse.json({ error: normalized.error }, { status: 400 });
        }
        const ids = normalized.ids;
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
        const normalized = normalizeItemIds(params.itemIds);
        if (!normalized.ok) {
          return NextResponse.json({ error: normalized.error }, { status: 400 });
        }
        const ids = normalized.ids;
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
        const collectionId = asString(params.collectionId);
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

        /**
         * Pull in chunks and stop on EITHER cap. The row cap alone never
         * bounded the payload (`data` is unbounded jsonb), so a real inbox blew
         * past Vercel's 4.5 MB response limit and the CSV button simply died.
         */
        type ExportRow = { id: string; data: unknown };
        const rows: ExportRow[] = [];
        let bytes = 0;
        let truncated = false;
        let reason: "rows" | "size" | null = null;

        for (let offset = 0; offset < EXPORT_CAP; offset += EXPORT_CHUNK) {
          let query = db
            .from("site_collection_items")
            .select(EXPORT_COLUMNS)
            .eq("collection_id", collectionId);
          query = applyItemFilter(query, filter);
          const { data: chunk, error } = await query
            .order("created_at", { ascending: false })
            .range(offset, Math.min(offset + EXPORT_CHUNK, EXPORT_CAP) - 1);
          if (error) {
            console.error("[cms/collections] items_export error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
          const batch = chunk ?? [];
          for (const row of batch) {
            const size = JSON.stringify(row).length;
            if (bytes + size > EXPORT_BYTE_BUDGET) {
              truncated = true;
              reason = "size";
              break;
            }
            bytes += size;
            rows.push(row as ExportRow);
          }
          if (truncated || batch.length < EXPORT_CHUNK) break;
        }
        if (!truncated && rows.length >= EXPORT_CAP) {
          truncated = true;
          reason = "rows";
        }
        if (truncated) {
          console.warn(
            "[cms/collections] items_export truncated for collection",
            collectionId,
            `(reason=${reason}, rows=${rows.length}, bytes=${bytes})`,
          );
        }

        return NextResponse.json({
          items: rows,
          truncated,
          reason,
          cap: EXPORT_CAP,
          byteBudget: EXPORT_BYTE_BUDGET,
        });
      }

      // ── Admin: fleet-wide collection read, requireSuperAdmin ─────────
      case "admin_list": {
        await requireSuperAdmin();
        const siteId = asString(params.siteId);
        // siteId is an OPTIONAL narrowing filter here (fleet-wide by default).
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
