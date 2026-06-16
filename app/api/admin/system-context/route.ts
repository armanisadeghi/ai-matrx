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
import type { Database, Json } from "@/types/database.types";

const SYSTEM_ORG_SLUG = "matrx-system";

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

// GET /api/admin/system-context — resolve the Matrx System org, its is_system
// scope types (the "categories"), and every item joined with its current value.
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin
    .from("organizations")
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
  const { data: scopeTypes, error: stError } = await admin
    .from("ctx_scope_types")
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
  const { data: scopes, error: scopeError } = await admin
    .from("ctx_scopes")
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

  const { data: items, error: itemError } = await admin
    .from("ctx_context_items")
    .select(
      "id, key, display_name, description, value_type, custom_component, sensitivity, status, category, tags, sort_order, is_active, scope_type_id",
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
    const { data: values, error: valError } = await admin
      .from("ctx_context_item_values")
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
      current_value: is_computed
        ? null
        : coerceValue(it.value_type, valueRow),
      is_computed,
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

// POST /api/admin/system-context — set a stored value for a non-computed item.
// INSERTs a new ctx_context_item_values row (the DB trigger flips
// is_current/version); routes the value into the column matching value_type.
//
// Body: { itemId, scopeId, valueType, value }  (value is a string from the UI)
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as {
    itemId?: string;
    scopeId?: string;
    valueType?: ValueType;
    value?: string;
  } | null;

  if (!body?.itemId || !body?.scopeId || !body?.valueType) {
    return NextResponse.json(
      { error: "itemId, scopeId, and valueType are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Guard: refuse to write a value for a computed (ambient) item — the server
  // computes those per request; a stored value would never be served.
  const { data: item, error: itemErr } = await admin
    .from("ctx_context_items")
    .select("id, key, value_type")
    .eq("id", body.itemId)
    .maybeSingle();
  if (itemErr) {
    return NextResponse.json({ error: itemErr.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "Context item not found" }, { status: 404 });
  }
  if (COMPUTED_KEYS.has(item.key)) {
    return NextResponse.json(
      { error: `'${item.key}' is computed at runtime and has no stored value` },
      { status: 422 },
    );
  }

  const raw = body.value ?? "";
  const insertRow: Database["public"]["Tables"]["ctx_context_item_values"]["Insert"] =
    {
      context_item_id: body.itemId,
      scope_id: body.scopeId,
      source_type: "manual",
    };

  switch (body.valueType) {
    case "number": {
      const n = Number(raw);
      if (raw.trim() === "" || Number.isNaN(n)) {
        return NextResponse.json(
          { error: "Value must be a valid number" },
          { status: 400 },
        );
      }
      insertRow.value_number = n;
      break;
    }
    case "boolean": {
      const t = raw.trim().toLowerCase();
      if (!["true", "false", "1", "0", "yes", "no"].includes(t)) {
        return NextResponse.json(
          { error: "Value must be a boolean (true/false)" },
          { status: 400 },
        );
      }
      insertRow.value_boolean = t === "true" || t === "1" || t === "yes";
      break;
    }
    case "object":
    case "array": {
      try {
        insertRow.value_json = JSON.parse(raw) as Json;
      } catch {
        return NextResponse.json(
          { error: `Value must be valid JSON for a ${body.valueType}` },
          { status: 400 },
        );
      }
      break;
    }
    case "date":
      insertRow.value_date = raw;
      break;
    case "document":
      insertRow.value_document_url = raw;
      break;
    case "reference":
    case "string":
    default:
      insertRow.value_text = raw;
      break;
  }

  const { error: insErr } = await admin
    .from("ctx_context_item_values")
    .insert(insertRow);

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
