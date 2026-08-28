// Super-Admin-only management surface for platform-wide "System Context Items".
//
// System Context is the platform's THIRD context source — what is simply TRUE,
// next to Scope-derived (what you're working on) and Surface-derived (where you
// are working). Since 2026-08-27 (ctx_100) it lives in its own canonical table,
// `context.system_context_item` — one row per item, ONE current value per row
// (System context has no scope dimension). The platform trigger trio versions
// every edit into history.row_versions, so value writes are plain UPDATEs —
// the old INSERT-not-UPDATE value convention is gone with the scope scaffolding.
//
// Three classes (item_class):
//   ambient — computed per request by the server; stored value is a placeholder
//   curated — admin-maintained platform truths (e.g. company_name)
//   dataset — industry reference bodies delivered as RAG pointers (feed_config)
//
// Rows live in the member-less "Matrx System" org (global_readable). Because the
// org has no members, writes use the service client (RLS bypass);
// requireSuperAdmin() gates every method.

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import type { Database, Json } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient<Database>;

const SYSTEM_ORG_SLUG = "matrx-system";

// Ambient items: the server computes the real value per request
// (matrx_ai.context_engine._apply_ambient), so the stored value is a
// placeholder and these are read-only here.
const COMPUTED_KEYS = new Set<string>([
  "current_date",
  "current_datetime",
  "current_time",
  "current_year",
  "current_user_id",
]);

type ValueType = Database["public"]["Enums"]["context_value_type"];
type Sensitivity = Database["public"]["Enums"]["context_sensitivity"];
type FeedType = Database["public"]["Enums"]["context_feed_type"];
type SystemContextUpdate =
  Database["context"]["Tables"]["system_context_item"]["Update"];

export type SystemItemClass = "ambient" | "curated" | "dataset";

export interface SystemContextItem {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  item_class: SystemItemClass;
  value_type: ValueType;
  /** The stored jsonb value (null when unset; a placeholder for ambient items). */
  value: Json | null;
  /** Human-readable rendering of `value` for the grid. */
  current_value: string | null;
  is_computed: boolean;
  feed_type: FeedType;
  feed_config: Json;
  feed_status: string | null;
  feed_error: string | null;
  last_fed_at: string | null;
  sensitivity: Sensitivity;
  is_active: boolean;
  sort_order: number;
}

export interface SystemContextPayload {
  organization_id: string;
  items: SystemContextItem[];
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

function systemTable(admin: AdminClient) {
  return admin.schema("context").from("system_context_item");
}

// Resolve the member-less Matrx System org id (service client; RLS-bypassing).
async function resolveSystemOrgId(admin: AdminClient): Promise<string> {
  const { data: org, error } = await admin
    .schema("iam")
    .from("organizations")
    .select("id")
    .eq("slug", SYSTEM_ORG_SLUG)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!org)
    throw new Error(`Matrx System org (slug '${SYSTEM_ORG_SLUG}') not found`);
  return org.id;
}

// Render the jsonb value as a display string for the grid.
function renderValue(value: Json | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJson);
  return isRecord(value) && Object.values(value).every(isJson);
}

// Route a raw string into the jsonb value column per value_type. Returns
// [value, null] on success or [null, errorMessage].
function coerceToJson(
  valueType: ValueType,
  raw: string,
): [Json | null, string | null] {
  switch (valueType) {
    case "number": {
      const n = Number(raw);
      if (raw.trim() === "" || Number.isNaN(n))
        return [null, "Value must be a valid number"];
      return [n, null];
    }
    case "boolean": {
      const t = raw.trim().toLowerCase();
      if (!["true", "false", "1", "0", "yes", "no"].includes(t))
        return [null, "Value must be a boolean (true/false)"];
      return [t === "true" || t === "1" || t === "yes", null];
    }
    case "object":
    case "array": {
      try {
        return [JSON.parse(raw) as Json, null];
      } catch {
        return [null, `Value must be valid JSON for a ${valueType}`];
      }
    }
    default:
      return [raw, null];
  }
}

export interface ResolvedPreviewEntry {
  key: string;
  type: string;
  source: string;
  description: string | null;
  value: Json;
}

// Preview exactly what an agent receives for global System context (no scope
// selected) — proves the whole pipeline end-to-end (ambient computes, curated
// values, dataset pointers) by calling the live resolver.
async function buildPreview(
  admin: AdminClient,
  userId: string,
): Promise<NextResponse> {
  const { data, error } = await admin.rpc("resolve_full_context", {
    p_user_id: userId,
    p_entity_type: "conversation",
    p_entity_id: "00000000-0000-0000-0000-000000000000",
    p_scope_ids: undefined,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const variablesValue = isRecord(data) ? data.variables : null;
  const variables = isRecord(variablesValue) ? variablesValue : {};
  const entries: ResolvedPreviewEntry[] = Object.entries(variables)
    .map(([key, v]) => {
      const o = isRecord(v) ? v : {};
      return {
        key,
        type: typeof o.type === "string" ? o.type : "string",
        source: typeof o.source === "string" ? o.source : "system",
        description: typeof o.description === "string" ? o.description : null,
        value: isJson(o.value) ? o.value : null,
      };
    })
    // Only the global (system-sourced) entries every user receives.
    .filter((e) => e.source === "system")
    .sort((a, b) => a.key.localeCompare(b.key));

  return NextResponse.json({ resolved: entries });
}

// GET /api/admin/system-context — every System Context Item with its value.
// GET ?preview=1 — what an agent actually receives for global System context.
export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const admin = createAdminClient();

  if (new URL(request.url).searchParams.has("preview")) {
    return buildPreview(admin, userId);
  }

  let organization_id: string;
  try {
    organization_id = await resolveSystemOrgId(admin);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 404 },
    );
  }

  const { data: rows, error } = await systemTable(admin)
    .select(
      "id, key, display_name, description, item_class, value_type, value, feed_type, feed_config, feed_status, feed_error, last_fed_at, sensitivity, is_active, sort_order",
    )
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const items: SystemContextItem[] = (rows ?? []).map((r) => {
    const is_computed = r.item_class === "ambient" || COMPUTED_KEYS.has(r.key);
    return {
      id: r.id,
      key: r.key,
      display_name: r.display_name,
      description: r.description,
      item_class: r.item_class as SystemItemClass,
      value_type: r.value_type,
      value: r.value,
      current_value: is_computed ? null : renderValue(r.value),
      is_computed,
      feed_type: r.feed_type,
      feed_config: r.feed_config,
      feed_status: r.feed_status,
      feed_error: r.feed_error,
      last_fed_at: r.last_fed_at,
      sensitivity: r.sensitivity,
      is_active: r.is_active,
      sort_order: r.sort_order,
    };
  });

  const payload: SystemContextPayload = { organization_id, items };
  return NextResponse.json(payload);
}

// Request bodies, discriminated by `action`. Legacy callers that POST a bare
// { itemId, value } are treated as a "set_value".
type CreateItemBody = {
  action: "create_item";
  key: string;
  display_name: string;
  item_class?: SystemItemClass; // default 'curated'; 'ambient' is seed-only
  value_type: ValueType;
  sensitivity?: Sensitivity;
  description?: string;
  feed_type?: FeedType;
  feed_config?: Json;
  value?: string | null;
};
type SetValueBody = {
  action?: "set_value";
  itemId: string;
  value?: string;
};
type PostBody = CreateItemBody | SetValueBody;

// POST /api/admin/system-context — create items and set values.
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as PostBody | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (body.action) {
      case "create_item":
        return await createItem(admin, body);
      case "set_value":
      default:
        return await setValue(admin, body as SetValueBody);
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

async function createItem(admin: AdminClient, body: CreateItemBody) {
  const key = body.key?.trim().toLowerCase();
  const displayName = body.display_name?.trim();
  if (!key || !displayName || !body.value_type) {
    return NextResponse.json(
      { error: "key, display_name, and value_type are required" },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9_]+$/.test(key)) {
    return NextResponse.json(
      {
        error:
          "key may only contain lowercase letters, numbers, and underscores",
      },
      { status: 400 },
    );
  }
  if (COMPUTED_KEYS.has(key)) {
    return NextResponse.json(
      { error: `'${key}' is a reserved ambient key` },
      { status: 409 },
    );
  }
  const itemClass: SystemItemClass = body.item_class ?? "curated";
  if (itemClass === "ambient") {
    // Ambient items are seeded with their server-side provider; creating one
    // here would produce a key the server never computes.
    return NextResponse.json(
      { error: "Ambient items are seeded by the platform, not created here" },
      { status: 422 },
    );
  }

  const organizationId = await resolveSystemOrgId(admin);
  const feedType: FeedType = body.feed_type ?? "manual";

  let value: Json | null = null;
  if (feedType === "manual" && body.value != null && body.value !== "") {
    const [coerced, valErr] = coerceToJson(body.value_type, body.value);
    if (valErr) return NextResponse.json({ error: valErr }, { status: 400 });
    value = coerced;
  }

  const { data: item, error } = await systemTable(admin)
    .insert({
      key,
      display_name: displayName,
      description:
        typeof body.description === "string" ? body.description.trim() : "",
      item_class: itemClass,
      value_type: body.value_type,
      value,
      feed_type: feedType,
      feed_config: body.feed_config === undefined ? {} : body.feed_config,
      // A non-manual feed hasn't run yet; mark it pending so the UI tells the
      // truth (the executor populates the value later).
      feed_status: feedType === "manual" ? null : "pending",
      sensitivity: body.sensitivity ?? "public",
      organization_id: organizationId,
    })
    .select("id")
    .single();
  if (error) {
    const dup = error.message.toLowerCase().includes("unique");
    return NextResponse.json(
      {
        error: dup
          ? `A System item with key "${key}" already exists`
          : error.message,
      },
      { status: dup ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, item_id: item.id });
}

// Set the value of a non-ambient item. A plain UPDATE — the platform version
// trigger snapshots the previous row into history.row_versions.
async function setValue(admin: AdminClient, body: SetValueBody) {
  if (!body?.itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }
  if (typeof body.value !== "string") {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  const { data: item, error: itemErr } = await systemTable(admin)
    .select("id, key, item_class, value_type")
    .eq("id", body.itemId)
    .maybeSingle();
  if (itemErr)
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item)
    return NextResponse.json(
      { error: "System context item not found" },
      { status: 404 },
    );
  if (item.item_class === "ambient" || COMPUTED_KEYS.has(item.key)) {
    return NextResponse.json(
      { error: `'${item.key}' is computed at runtime and has no stored value` },
      { status: 422 },
    );
  }

  const [value, valErr] = coerceToJson(item.value_type, body.value);
  if (valErr) return NextResponse.json({ error: valErr }, { status: 400 });

  const { error } = await systemTable(admin)
    .update({ value })
    .eq("id", body.itemId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/system-context — edit an item's definition.
export async function PATCH(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    display_name?: string;
    description?: string;
    sensitivity?: Sensitivity;
    is_active?: boolean;
    item_class?: SystemItemClass;
    feed_type?: FeedType;
    feed_config?: Json;
    sort_order?: number;
  } | null;

  if (!body?.itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const patch: SystemContextUpdate = {};
  if (body.display_name !== undefined)
    patch.display_name = body.display_name.trim();
  if (body.description !== undefined)
    patch.description = body.description.trim();
  if (body.sensitivity !== undefined) patch.sensitivity = body.sensitivity;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.item_class !== undefined) {
    if (body.item_class === "ambient") {
      return NextResponse.json(
        { error: "Items cannot be reclassified as ambient" },
        { status: 422 },
      );
    }
    patch.item_class = body.item_class;
  }
  if (body.feed_type !== undefined) {
    patch.feed_type = body.feed_type;
    // Re-mark feed status when the feed changes: manual has no executor.
    patch.feed_status = body.feed_type === "manual" ? null : "pending";
  }
  if (body.feed_config !== undefined) patch.feed_config = body.feed_config;
  if (body.sort_order !== undefined) patch.sort_order = body.sort_order;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await systemTable(admin)
    .update(patch)
    .eq("id", body.itemId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/system-context?id=<itemId> — soft-delete an item.
export async function DELETE(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: item, error: itemErr } = await systemTable(admin)
    .select("id, item_class")
    .eq("id", id)
    .maybeSingle();
  if (itemErr)
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item)
    return NextResponse.json(
      { error: "System context item not found" },
      { status: 404 },
    );
  if (item.item_class === "ambient") {
    return NextResponse.json(
      {
        error: "Ambient items are platform infrastructure — deactivate instead",
      },
      { status: 422 },
    );
  }

  const { error } = await systemTable(admin)
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
