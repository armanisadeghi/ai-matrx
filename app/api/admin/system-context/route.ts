// Super-Admin-only management surface for platform-wide "System Context Items".
//
// System context items live in a dedicated member-less org "Matrx System"
// (slug `matrx-system`). Their scope types carry is_system=true, so the
// resolver serves their values globally — to EVERY user, with no scope
// selection. Because the org has no members, the membership-gated
// set_scope_context_value RPC would block writes; this route therefore writes
// values directly to ctx_context_item_values via the service client (RLS
// bypass). requireSuperAdmin() gates every method.
//
// Value writes follow the INSERT-not-UPDATE contract: a DB trigger flips
// is_current/version, so a new value is a new row, never an in-place edit.

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { contextDb } from "@/utils/supabase/contextDb";
import { createClient } from "@/utils/supabase/server";
import type { Database, Json } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_ORG_SLUG = "matrx-system";

// Authoring + value writes for platform-wide System Context (see header).
type AdminClient = SupabaseClient<Database>;
type ValueInsert =
  Database["context"]["Tables"]["context_item_values"]["Insert"];

// Class-1 ambient/computed items: the server computes the real value per
// request, so the stored value is just a placeholder and these are read-only.
const COMPUTED_KEYS = new Set<string>([
  "current_date",
  "current_datetime",
  "current_time",
  "current_year",
  "current_user_id",
]);

type ValueType = Database["public"]["Enums"]["context_value_type"];
type Sensitivity = Database["public"]["Enums"]["context_sensitivity"];
type ItemStatus = Database["public"]["Enums"]["context_item_status"];
type FeedType = Database["public"]["Enums"]["context_feed_type"];

interface ItemValueRow {
  scope_id: string;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_json: Json | null;
  value_date: string | null;
  value_document_url: string | null;
}

export interface SystemContextItem {
  id: string;
  key: string;
  display_name: string;
  description: string;
  value_type: ValueType;
  custom_component: Json | null;
  component_type: string | null;
  sensitivity: Sensitivity;
  status: ItemStatus;
  category: string | null;
  tags: string[];
  sort_order: number;
  is_active: boolean;
  scope_type_id: string;
  scope_type_label: string;
  scope_id: string | null;
  current_value: string | null;
  is_computed: boolean;
  // The feed — how this item's value is populated (the authored thing).
  feed_type: FeedType;
  feed_config: Json;
  feed_status: string | null;
  last_fed_at: string | null;
}

export interface SystemContextCategory {
  scope_type_id: string;
  label_singular: string;
  label_plural: string;
  icon: string;
  color: string;
  description: string;
  scope_id: string | null;
  item_count: number;
}

export interface SystemContextPayload {
  organization_id: string;
  categories: SystemContextCategory[];
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

// Coerce the typed value columns into one display string (or null when unset).
function coerceValue(
  valueType: ValueType,
  row: ItemValueRow | undefined,
): string | null {
  if (!row) return null;
  switch (valueType) {
    case "number":
      return row.value_number === null ? null : String(row.value_number);
    case "boolean":
      return row.value_boolean === null ? null : String(row.value_boolean);
    case "object":
    case "array":
      return row.value_json === null ? null : JSON.stringify(row.value_json);
    case "date":
      return row.value_date;
    case "document":
      return row.value_document_url;
    case "reference":
    case "string":
    default:
      return row.value_text;
  }
}

function readComponentType(custom_component: Json | null): string | null {
  if (
    custom_component &&
    typeof custom_component === "object" &&
    !Array.isArray(custom_component) &&
    typeof (custom_component as Record<string, unknown>).type === "string"
  ) {
    return (custom_component as Record<string, unknown>).type as string;
  }
  return null;
}

// Resolve the member-less Matrx System org id (service client; RLS-bypassing).
async function resolveSystemOrgId(admin: AdminClient): Promise<string> {
  const { data: org, error } = await admin
    .schema("iam").from("organizations")
    .select("id")
    .eq("slug", SYSTEM_ORG_SLUG)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!org)
    throw new Error(`Matrx System org (slug '${SYSTEM_ORG_SLUG}') not found`);
  return org.id;
}

// Every system scope type carries exactly one scope (in the system org) that
// its item values hang on. Return it, creating it if absent — values can't be
// written until this "cell column" exists (trigger ctx_validate_value_scope_type
// requires scope.scope_type_id === item.scope_type_id).
async function ensureScopeForType(
  admin: AdminClient,
  organizationId: string,
  scopeTypeId: string,
  fallbackName: string,
): Promise<string> {
  const { data: existing, error: selErr } = await contextDb(admin)
    .from("scopes")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("scope_type_id", scopeTypeId)
    .limit(1)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing.id;

  const { data: created, error: insErr } = await contextDb(admin)
    .from("scopes")
    .insert({
      organization_id: organizationId,
      scope_type_id: scopeTypeId,
      name: fallbackName,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return created.id;
}

// Copy a pre-routed value payload (built client-side by buildScopeValuePayload,
// which honors each item's component — incl. media MediaRefs in value_json)
// onto an insert row, whitelisting only the value_* columns. Mutates `row`.
const VALUE_COLUMNS = [
  "value_text",
  "value_number",
  "value_boolean",
  "value_json",
  "value_date",
  "value_document_url",
] as const;

function applyValueColumns(
  row: ValueInsert,
  columns: Record<string, unknown>,
): void {
  for (const col of VALUE_COLUMNS) {
    if (col in columns) {
      (row as Record<string, unknown>)[col] = columns[col];
    }
  }
}

// Route a string (or already-structured JSON) value into the column matching
// value_type. Mutates `row`. Returns an error message, or null on success.
function applyValueToRow(
  row: ValueInsert,
  valueType: ValueType,
  raw: string,
): string | null {
  switch (valueType) {
    case "number": {
      const n = Number(raw);
      if (raw.trim() === "" || Number.isNaN(n))
        return "Value must be a valid number";
      row.value_number = n;
      return null;
    }
    case "boolean": {
      const t = raw.trim().toLowerCase();
      if (!["true", "false", "1", "0", "yes", "no"].includes(t)) {
        return "Value must be a boolean (true/false)";
      }
      row.value_boolean = t === "true" || t === "1" || t === "yes";
      return null;
    }
    case "object":
    case "array": {
      try {
        row.value_json = JSON.parse(raw) as Json;
      } catch {
        return `Value must be valid JSON for a ${valueType}`;
      }
      return null;
    }
    case "date":
      row.value_date = raw;
      return null;
    case "document":
      row.value_document_url = raw;
      return null;
    case "reference":
    case "string":
    default:
      row.value_text = raw;
      return null;
  }
}

export interface ResolvedPreviewEntry {
  key: string;
  type: string;
  source: string;
  description: string | null;
  value: Json;
}

// Preview exactly what an agent receives for global system context (no scope
// selected) — proves the whole feed pipeline end-to-end (ambient computes,
// manual values, dataset pointers) by calling the live resolver.
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

  const variables =
    data && typeof data === "object" && !Array.isArray(data)
      ? (((data as Record<string, unknown>).variables as Record<
          string,
          unknown
        >) ?? {})
      : {};
  const entries: ResolvedPreviewEntry[] = Object.entries(variables)
    .map(([key, v]) => {
      const o = (v ?? {}) as Record<string, unknown>;
      return {
        key,
        type: typeof o.type === "string" ? o.type : "string",
        source: typeof o.source === "string" ? o.source : "system",
        description: typeof o.description === "string" ? o.description : null,
        value: (o.value ?? null) as Json,
      };
    })
    // Only the global (system-sourced) entries every user receives.
    .filter((e) => e.source === "system")
    .sort((a, b) => a.key.localeCompare(b.key));

  return NextResponse.json({ resolved: entries });
}

// GET /api/admin/system-context — resolve the Matrx System org, its is_system
// scope types (the "categories"), and every item joined with its current value.
// GET ?preview=1 — what an agent actually receives for global system context.
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

  const { data: org, error: orgError } = await admin
    .schema("iam").from("organizations")
    .select("id")
    .eq("slug", SYSTEM_ORG_SLUG)
    .maybeSingle();

  if (orgError) {
    return NextResponse.json({ error: orgError.message }, { status: 500 });
  }
  if (!org) {
    return NextResponse.json(
      { error: `Matrx System org (slug '${SYSTEM_ORG_SLUG}') not found` },
      { status: 404 },
    );
  }
  const organization_id = org.id;

  // is_system scope types in this org = the System categories.
  const { data: scopeTypes, error: stError } = await contextDb(admin)
    .from("scope_types")
    .select(
      "id, label_singular, label_plural, icon, color, description, sort_order",
    )
    .eq("organization_id", organization_id)
    .eq("is_system", true)
    .order("sort_order", { ascending: true });

  if (stError) {
    return NextResponse.json({ error: stError.message }, { status: 500 });
  }

  const scopeTypeIds = (scopeTypes ?? []).map((t) => t.id);
  if (scopeTypeIds.length === 0) {
    const empty: SystemContextPayload = {
      organization_id,
      categories: [],
      items: [],
    };
    return NextResponse.json(empty);
  }

  // Each scope type has one scope (in this org) holding its values.
  const { data: scopes, error: scopeError } = await contextDb(admin)
    .from("scopes")
    .select("id, scope_type_id")
    .eq("organization_id", organization_id)
    .in("scope_type_id", scopeTypeIds);

  if (scopeError) {
    return NextResponse.json({ error: scopeError.message }, { status: 500 });
  }
  const scopeByType = new Map<string, string>();
  for (const s of scopes ?? []) {
    if (!scopeByType.has(s.scope_type_id)) {
      scopeByType.set(s.scope_type_id, s.id);
    }
  }

  const { data: items, error: itemError } = await contextDb(admin)
    .from("context_items")
    .select(
      "id, key, display_name, description, value_type, custom_component, sensitivity, status, category, tags, sort_order, is_active, scope_type_id, feed_type, feed_config, feed_status, last_fed_at",
    )
    .in("scope_type_id", scopeTypeIds)
    .order("sort_order", { ascending: true })
    .order("key", { ascending: true });

  if (itemError) {
    return NextResponse.json({ error: itemError.message }, { status: 500 });
  }

  const itemIds = (items ?? []).map((i) => i.id);

  // Current value (is_current=true) for each item.
  const valueByItem = new Map<string, ItemValueRow>();
  if (itemIds.length > 0) {
    const { data: values, error: valError } = await contextDb(admin)
      .from("context_item_values")
      .select(
        "context_item_id, scope_id, value_text, value_number, value_boolean, value_json, value_date, value_document_url",
      )
      .in("context_item_id", itemIds)
      .eq("is_current", true);

    if (valError) {
      return NextResponse.json({ error: valError.message }, { status: 500 });
    }
    for (const v of values ?? []) {
      valueByItem.set(v.context_item_id, v);
    }
  }

  const typeLabel = new Map<string, string>();
  for (const t of scopeTypes ?? []) typeLabel.set(t.id, t.label_singular);

  const shapedItems: SystemContextItem[] = (items ?? []).map((it) => {
    const scope_id = scopeByType.get(it.scope_type_id) ?? null;
    const valueRow = valueByItem.get(it.id);
    const is_computed = COMPUTED_KEYS.has(it.key);
    return {
      id: it.id,
      key: it.key,
      display_name: it.display_name,
      description: it.description,
      value_type: it.value_type,
      custom_component: it.custom_component,
      component_type: readComponentType(it.custom_component),
      sensitivity: it.sensitivity,
      status: it.status,
      category: it.category,
      tags: it.tags ?? [],
      sort_order: it.sort_order,
      is_active: it.is_active,
      scope_type_id: it.scope_type_id,
      scope_type_label: typeLabel.get(it.scope_type_id) ?? "—",
      scope_id,
      current_value: is_computed ? null : coerceValue(it.value_type, valueRow),
      is_computed,
      feed_type: it.feed_type,
      feed_config: it.feed_config,
      feed_status: it.feed_status,
      last_fed_at: it.last_fed_at,
    };
  });

  const counts = new Map<string, number>();
  for (const it of shapedItems) {
    counts.set(it.scope_type_id, (counts.get(it.scope_type_id) ?? 0) + 1);
  }

  const categories: SystemContextCategory[] = (scopeTypes ?? []).map((t) => ({
    scope_type_id: t.id,
    label_singular: t.label_singular,
    label_plural: t.label_plural,
    icon: t.icon,
    color: t.color,
    description: t.description,
    scope_id: scopeByType.get(t.id) ?? null,
    item_count: counts.get(t.id) ?? 0,
  }));

  const payload: SystemContextPayload = {
    organization_id,
    categories,
    items: shapedItems,
  };
  return NextResponse.json(payload);
}

// Request bodies, discriminated by `action`. Legacy callers that POST a bare
// { itemId, scopeId, valueType, value } are treated as a "set_value".
type CreateScopeTypeBody = {
  action: "create_scope_type";
  label_singular: string;
  label_plural: string;
  icon?: string;
  color?: string;
  description?: string;
};
type CreateItemBody = {
  action: "create_item";
  scopeTypeId: string;
  key: string;
  display_name: string;
  value_type: ValueType;
  sensitivity?: Sensitivity;
  description?: string;
  custom_component?: Json | null;
  // The feed — how this item is populated. Defaults to 'manual'.
  feed_type?: FeedType;
  feed_config?: Json;
  // Initial value (manual feeds only): either a raw string (coerced by
  // value_type) or pre-routed value_* columns built client-side.
  value?: string | null;
  valueColumns?: Record<string, unknown>;
};
type SetValueBody = {
  action?: "set_value";
  itemId: string;
  scopeId: string;
  valueType: ValueType;
  value?: string;
  valueColumns?: Record<string, unknown>;
};
type PostBody = CreateScopeTypeBody | CreateItemBody | SetValueBody;

// POST /api/admin/system-context — authoring + value writes for system context.
// All writes use the service client (the system org is member-less, so RLS /
// membership-gated RPCs would block them). The single exception is flipping
// is_system, which the DB trigger gates on is_super_admin() against the live
// JWT — done with the caller's authenticated client.
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
      case "create_scope_type":
        return await createScopeType(admin, body);
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

// Create a new System category: a scope type (is_system=true) + its one scope.
async function createScopeType(admin: AdminClient, body: CreateScopeTypeBody) {
  const labelSingular = body.label_singular?.trim();
  const labelPlural = body.label_plural?.trim() || labelSingular;
  if (!labelSingular) {
    return NextResponse.json(
      { error: "label_singular is required" },
      { status: 400 },
    );
  }

  const organizationId = await resolveSystemOrgId(admin);

  const { data: st, error: stErr } = await contextDb(admin)
    .from("scope_types")
    .insert({
      organization_id: organizationId,
      label_singular: labelSingular,
      label_plural: labelPlural,
      icon: body.icon?.trim() || "globe",
      color: body.color?.trim() || "",
      description: body.description?.trim() || "",
    })
    .select("id")
    .single();
  if (stErr) {
    const dup = stErr.message.includes("unique_type_per_org");
    return NextResponse.json(
      {
        error: dup
          ? `A System category named "${labelSingular}" already exists`
          : stErr.message,
      },
      { status: dup ? 409 : 500 },
    );
  }

  // Flip is_system with the caller's super-admin JWT (the trigger re-checks
  // is_super_admin() live; the service client's auth.uid() is null and fails).
  const userClient = await createClient();
  const { error: sysErr } = await userClient.rpc(
    "admin_set_scope_type_system",
    {
      p_scope_type_id: st.id,
      p_is_system: true,
    },
  );
  if (sysErr) {
    // Roll back the half-created type so it never shows in a non-system grid.
    await contextDb(admin).from("scope_types").delete().eq("id", st.id);
    return NextResponse.json(
      { error: `Could not mark category as system: ${sysErr.message}` },
      { status: 500 },
    );
  }

  // The single scope that holds this category's values.
  await ensureScopeForType(admin, organizationId, st.id, labelSingular);

  return NextResponse.json({ ok: true, scope_type_id: st.id });
}

// Create a new System context item (the "column" definition) under a scope
// type, optionally seeding its initial value.
async function createItem(admin: AdminClient, body: CreateItemBody) {
  const key = body.key?.trim().toLowerCase();
  const displayName = body.display_name?.trim();
  if (!key || !displayName || !body.scopeTypeId || !body.value_type) {
    return NextResponse.json(
      { error: "scopeTypeId, key, display_name, and value_type are required" },
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

  const organizationId = await resolveSystemOrgId(admin);
  const feedType: FeedType = body.feed_type ?? "manual";

  const { data: item, error: itemErr } = await contextDb(admin)
    .from("context_items")
    .insert({
      scope_type_id: body.scopeTypeId,
      key,
      display_name: displayName,
      value_type: body.value_type,
      sensitivity: body.sensitivity ?? "internal",
      description: body.description?.trim() || "",
      custom_component: body.custom_component ?? null,
      status: "active",
      source_type: "manual",
      feed_type: feedType,
      feed_config: body.feed_config ?? {},
      // A non-manual feed hasn't run yet; mark it pending so the UI tells the
      // truth (the executor populates the value later).
      feed_status: feedType === "manual" ? null : "pending",
    })
    .select("id")
    .single();
  if (itemErr) {
    const dup = itemErr.message.includes("context_items_key_per_type");
    return NextResponse.json(
      {
        error: dup
          ? `An item with key "${key}" already exists in this category`
          : itemErr.message,
      },
      { status: dup ? 409 : 500 },
    );
  }

  // Seed the initial value if one was supplied (manual feeds only — other
  // feeds produce their value through their executor, not a typed seed).
  const hasColumns =
    body.valueColumns != null && Object.keys(body.valueColumns).length > 0;
  if (
    feedType === "manual" &&
    (hasColumns || (body.value != null && body.value !== ""))
  ) {
    const scopeId = await ensureScopeForType(
      admin,
      organizationId,
      body.scopeTypeId,
      key,
    );
    const row: ValueInsert = {
      context_item_id: item.id,
      scope_id: scopeId,
      source_type: "manual",
    };
    if (hasColumns) {
      applyValueColumns(row, body.valueColumns!);
    } else {
      const valErr = applyValueToRow(row, body.value_type, body.value!);
      if (valErr) {
        return NextResponse.json(
          { error: valErr, item_id: item.id },
          { status: 400 },
        );
      }
    }
    const { error: insErr } = await contextDb(admin)
      .from("context_item_values")
      .insert(row);
    if (insErr) {
      return NextResponse.json(
        { error: insErr.message, item_id: item.id },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, item_id: item.id });
}

// Set a stored value for a non-computed item (new is_current version row).
async function setValue(admin: AdminClient, body: SetValueBody) {
  if (!body?.itemId || !body?.scopeId || !body?.valueType) {
    return NextResponse.json(
      { error: "itemId, scopeId, and valueType are required" },
      { status: 400 },
    );
  }

  const { data: item, error: itemErr } = await contextDb(admin)
    .from("context_items")
    .select("id, key")
    .eq("id", body.itemId)
    .maybeSingle();
  if (itemErr)
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  if (!item)
    return NextResponse.json(
      { error: "Context item not found" },
      { status: 404 },
    );
  if (COMPUTED_KEYS.has(item.key)) {
    return NextResponse.json(
      { error: `'${item.key}' is computed at runtime and has no stored value` },
      { status: 422 },
    );
  }

  const row: ValueInsert = {
    context_item_id: body.itemId,
    scope_id: body.scopeId,
    source_type: "manual",
  };
  if (body.valueColumns != null && Object.keys(body.valueColumns).length > 0) {
    applyValueColumns(row, body.valueColumns);
  } else {
    const valErr = applyValueToRow(row, body.valueType, body.value ?? "");
    if (valErr) return NextResponse.json({ error: valErr }, { status: 400 });
  }

  const { error: insErr } = await contextDb(admin)
    .from("context_item_values")
    .insert(row);
  if (insErr)
    return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// PATCH /api/admin/system-context — edit an item's definition (metadata +
// component). Value edits go through POST set_value (versioned).
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
    custom_component?: Json | null;
    is_active?: boolean;
    feed_type?: FeedType;
    feed_config?: Json;
  } | null;

  if (!body?.itemId) {
    return NextResponse.json({ error: "itemId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const patch: Database["context"]["Tables"]["context_items"]["Update"] = {};
  if (body.display_name !== undefined)
    patch.display_name = body.display_name.trim();
  if (body.description !== undefined)
    patch.description = body.description.trim();
  if (body.sensitivity !== undefined) patch.sensitivity = body.sensitivity;
  if (body.custom_component !== undefined)
    patch.custom_component = body.custom_component;
  if (body.is_active !== undefined) patch.is_active = body.is_active;
  if (body.feed_type !== undefined) {
    patch.feed_type = body.feed_type;
    // Re-mark feed status when the feed changes: manual has no executor.
    patch.feed_status = body.feed_type === "manual" ? null : "pending";
  }
  if (body.feed_config !== undefined) patch.feed_config = body.feed_config;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await contextDb(admin)
    .from("context_items")
    .update(patch)
    .eq("id", body.itemId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/system-context?type=item|scope_type&id=<uuid>
// Deleting a scope type cascades to its items, scopes, and values.
export async function DELETE(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if (!id || (type !== "item" && type !== "scope_type")) {
    return NextResponse.json(
      { error: "type (item|scope_type) and id are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  if (type === "item") {
    const { data: item } = await contextDb(admin)
      .from("context_items")
      .select("key")
      .eq("id", id)
      .maybeSingle();
    if (item && COMPUTED_KEYS.has(item.key)) {
      return NextResponse.json(
        {
          error: `'${item.key}' is a built-in ambient item and cannot be deleted`,
        },
        { status: 422 },
      );
    }
    const { error } = await contextDb(admin)
      .from("context_items")
      .delete()
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // scope_type — guard the built-in Environment category (holds ambient items).
  const { data: items } = await contextDb(admin)
    .from("context_items")
    .select("key")
    .eq("scope_type_id", id);
  if ((items ?? []).some((i) => COMPUTED_KEYS.has(i.key))) {
    return NextResponse.json(
      {
        error:
          "This category holds built-in ambient items and cannot be deleted",
      },
      { status: 422 },
    );
  }
  const { error } = await contextDb(admin)
    .from("scope_types")
    .delete()
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
