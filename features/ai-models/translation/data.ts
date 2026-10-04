/**
 * Settings translation grid — the reads and the two human doors.
 *
 * Reads go straight to the database (supabase-js + RLS). Writes NEVER touch
 * `ai.translation_cell` directly: a save goes through `ai.save_translation_cell`
 * (approves and stamps the caller as approver) and an archive through
 * `ai.archive_translation_cell` — both refuse anyone who is not a signed-in
 * platform admin (aidream db/migrations/campaign/st_c2b_wiring.sql §6).
 *
 * The tables exist on the nightly clone before live. On a database without them
 * the read answers `{status: "absent"}` and the screen says so in one line.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { IncompleteReadError, readAllRows } from "@ai-matrx/data/db";
import { supabase } from "@/utils/supabase/client";
import type { ControlRule } from "../types";
import type { OfferingCellRow } from "../controls/resolveControls";
import type {
  ModelCapabilities,
  CompiledRow,
  SettingProfileRow,
  TranslationApi,
  TranslationBundle,
  TranslationCellRow,
  TranslationOffering,
  TranslationRead,
  TranslationSetting,
} from "./types";

/** The `ai` schema without the generated types (see ./types.ts header). */
function ai() {
  return (supabase as unknown as SupabaseClient).schema("ai");
}

/** PostgREST / Postgres codes for "this relation or function is not here". */
const ABSENT_CODES = new Set(["PGRST205", "PGRST202", "42P01", "42883"]);

export function isAbsentRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && ABSENT_CODES.has(code);
}

// `evidence` is left out of the list read: it is the heaviest column and the
// screen never draws it.
const CELL_COLUMNS =
  "id, layer, layer_owner_id, setting_key, rule, state, confidence, rationale, source, conflict, rejection_fingerprint, approved_by, approved_at, version, updated_at";

const PAGE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null; count?: number | null };

/**
 * Every row, pages fetched in parallel. The first page carries the exact count;
 * the rest are fetched at once and the total is checked, so a short read throws
 * instead of returning a partial list (same contract as `readAllRows`).
 */
async function readAllRowsParallel<T>(
  page: (range: { from: number; to: number }, withCount: boolean) => PromiseLike<PageResult<T>>,
  label: string,
): Promise<T[]> {
  const first = await page({ from: 0, to: PAGE - 1 }, true);
  if (first.error) throw new Error(`${label}: ${first.error.message}`);
  const rows = [...(first.data ?? [])];
  const total = typeof first.count === "number" ? first.count : null;
  if (total === null) {
    if (rows.length < PAGE) return rows;
    throw new IncompleteReadError(label, rows.length, null, "the query returned no count");
  }
  const rest: Promise<PageResult<T>>[] = [];
  for (let from = PAGE; from < total; from += PAGE) {
    rest.push(Promise.resolve(page({ from, to: from + PAGE - 1 }, false)));
  }
  for (const res of await Promise.all(rest)) {
    if (res.error) throw new Error(`${label}: ${res.error.message}`);
    rows.push(...(res.data ?? []));
  }
  if (rows.length < total) {
    throw new IncompleteReadError(label, rows.length, total, "a page came back short");
  }
  return rows;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

async function readCells(): Promise<TranslationCellRow[]> {
  const rows = await readAllRowsParallel<TranslationCellRow>(
    ({ from, to }, withCount) =>
      ai()
        .from("translation_cell")
        .select(CELL_COLUMNS, withCount ? { count: "exact" } : undefined)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<PageResult<TranslationCellRow>>,
    "ai.translation_cell",
  );
  return rows.map((r) => ({
    ...r,
    rule: (r.rule ?? {}) as ControlRule,
    confidence: toNumberOrNull(r.confidence),
    evidence: [],
  }));
}

async function readCompiled(): Promise<CompiledRow[]> {
  return readAllRowsParallel<CompiledRow>(
    ({ from, to }, withCount) =>
      ai()
        .from("offering_rules_compiled")
        .select("offering_id, setting_key, cell_id, layer, state", withCount ? { count: "exact" } : undefined)
        .order("offering_id", { ascending: true })
        .order("setting_key", { ascending: true })
        .range(from, to) as unknown as PromiseLike<PageResult<CompiledRow>>,
    "ai.offering_rules_compiled",
  );
}

/** One offering's K5 rows WITH their rules — the rule source
 *  `ai.resolve_model_config` and `resolveControls.buildControlRows` use when it
 *  is non-empty. `null` = the view is not on this database (legacy columns). */
export async function readOfferingCells(offeringId: string): Promise<OfferingCellRow[] | null> {
  const { data, error } = await ai()
    .from("offering_rules_compiled")
    .select("offering_id, setting_key, rule, cell_id, layer, state, version")
    .eq("offering_id", offeringId)
    .order("setting_key", { ascending: true });
  if (error) {
    if (isAbsentRelationError(error)) return null;
    throw error;
  }
  return ((data ?? []) as OfferingCellRow[]).map((r) => ({
    ...r,
    rule: (r.rule ?? {}) as ControlRule,
  }));
}

async function readProfiles(): Promise<SettingProfileRow[]> {
  const { data, error } = await ai()
    .from("setting_profile")
    .select("id, api_id, name, modality")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SettingProfileRow[];
}

async function readApis(): Promise<TranslationApi[]> {
  const { data, error } = await ai()
    .from("api")
    .select("id, name, display_name, translator_key")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as TranslationApi[];
}

async function readOfferings(): Promise<TranslationOffering[]> {
  const [offerings, models] = await Promise.all([
    readAllRows<{
      id: string;
      api_id: string;
      model_id: string;
      provider_model_id: string | null;
      setting_profile_id: string | null;
      capabilities_override: Record<string, unknown> | null;
    }>(
      ({ from, to }) =>
        ai()
          .from("offering")
          .select("id, api_id, model_id, provider_model_id, setting_profile_id, capabilities_override", {
            count: "exact",
          })
          .eq("is_available", true)
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      { label: "ai.offering" },
    ),
    readAllRows<{
      id: string;
      name: string | null;
      common_name: string | null;
      capabilities: Record<string, unknown> | null;
    }>(
      ({ from, to }) =>
        ai()
          .from("model_definition")
          .select("id, name, common_name, capabilities", { count: "exact" })
          .is("deleted_at", null)
          .order("id", { ascending: true })
          .range(from, to),
      { label: "ai.model_definition" },
    ),
  ]);
  const nameById = new Map(models.map((m) => [m.id, m.common_name || m.name || m.id]));
  const capsById = new Map(models.map((m) => [m.id, m.capabilities]));
  return offerings.map(({ capabilities_override, ...o }) => ({
    ...o,
    model_name: nameById.get(o.model_id) ?? o.provider_model_id ?? o.id,
    capabilities: listingCapabilities(capsById.get(o.model_id), capabilities_override),
  }));
}

/** The model's declared capabilities, the listing's override winning key by key. */
function listingCapabilities(
  model: Record<string, unknown> | null | undefined,
  override: Record<string, unknown> | null,
): ModelCapabilities | null {
  const merged: Record<string, unknown> = { ...(model ?? {}) };
  for (const key of ["input", "output", "interaction"] as const) {
    if (override && key in override) merged[key] = override[key];
  }
  const words = (v: unknown) => (Array.isArray(v) ? v.map(String) : null);
  if (!model && !override) return null;
  return {
    input: words(merged.input),
    output: words(merged.output),
    interaction: typeof merged.interaction === "string" ? merged.interaction : null,
  };
}

async function readSettings(): Promise<TranslationSetting[]> {
  const [settingsRes, familiesRes] = await Promise.all([
    ai()
      .from("setting")
      .select(
        "key, value_type, canonical_min, canonical_max, canonical_values, default_value, value_positions, family",
      )
      .is("deleted_at", null)
      .order("key", { ascending: true }),
    (supabase as unknown as SupabaseClient)
      .schema("platform")
      .from("categories")
      .select("id, name")
      .eq("dimension", "ai_setting_family"),
  ]);
  if (settingsRes.error) throw settingsRes.error;
  if (familiesRes.error) throw familiesRes.error;
  const familyName = new Map(
    ((familiesRes.data ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name]),
  );
  const seen = new Set<string>();
  const out: TranslationSetting[] = [];
  for (const raw of (settingsRes.data ?? []) as Record<string, unknown>[]) {
    const key = String(raw.key);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      value_type: String(raw.value_type ?? "string"),
      canonical_min: toNumberOrNull(raw.canonical_min),
      canonical_max: toNumberOrNull(raw.canonical_max),
      canonical_values: Array.isArray(raw.canonical_values) ? raw.canonical_values : null,
      default_value: raw.default_value ?? null,
      value_positions:
        raw.value_positions && typeof raw.value_positions === "object"
          ? (raw.value_positions as Record<string, number>)
          : null,
      family: typeof raw.family === "string" ? (familyName.get(raw.family) ?? null) : null,
    });
  }
  return out;
}

/** The whole grid's read. `absent` when the translation tables are not on this database. */
export async function readTranslationBundle(): Promise<TranslationRead> {
  // Probe with a plain read first: `readAllRows` rewraps a failure as a bare
  // Error and drops the PostgREST code, so "the table is not here" could never
  // be told apart from a real failure through it.
  const probe = await ai().from("translation_cell").select("id").limit(1);
  if (probe.error) {
    // PGRST205 = "not in the schema cache" (the table does not exist here).
    if (isAbsentRelationError(probe.error) || probe.status === 404) return { status: "absent" };
    throw probe.error;
  }
  const [cells, compiled, profiles, apis, offerings, settings] = await Promise.all([
    readCells(),
    readCompiled(),
    readProfiles(),
    readApis(),
    readOfferings(),
    readSettings(),
  ]);
  const bundle: TranslationBundle = { cells, compiled, profiles, apis, offerings, settings };
  return { status: "ready", bundle };
}

export type SaveCellArgs = {
  layer: TranslationCellRow["layer"];
  ownerId: string;
  settingKey: string;
  rule: ControlRule;
  rationale?: string | null;
};

/** THE human door: saves one cell and approves it, stamping the caller. */
export async function saveTranslationCell(args: SaveCellArgs): Promise<{ cellId: string; state: string }> {
  const { data, error } = await ai().rpc("save_translation_cell", {
    p_layer: args.layer,
    p_layer_owner_id: args.ownerId,
    p_setting_key: args.settingKey,
    p_rule: args.rule,
    p_rationale: args.rationale ?? null,
    p_approve: true,
  });
  if (error) throw error;
  const reply = (data ?? {}) as { cell_id?: string; state?: string };
  return { cellId: String(reply.cell_id ?? ""), state: String(reply.state ?? "") };
}

/** Archive door (never a delete): the next layer down takes over. */
export async function archiveTranslationCell(cellId: string): Promise<void> {
  const { error } = await ai().rpc("archive_translation_cell", { p_cell_id: cellId });
  if (error) throw error;
}

/** True only for a signed-in platform admin — the doors' own gate, asked of the database. */
export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}
