/**
 * Settings translation grid — the pure model (no React, no I/O).
 *
 * Rows are settings (grouped by setting family); columns are settings profiles
 * and wire APIs, grouped by modality. A grid cell is the cell at that column's
 * own layer, plus what its member models do differently (offering-layer cells)
 * and which members resolve the key by computation (MISSING — contract K4:
 * "a key with NO cell at any layer = computed").
 *
 * "Missing" mirrors the T1 completeness guard (aidream
 * aidream/testing/settings_grid.py): a key is relevant to a modality when ANY
 * available offering of that modality declares a rule for it (data, never a
 * hand list), `object`-typed settings are never probed, and the modality of an
 * API comes from its translator key suffix (`modality_of`).
 */

import type { ControlRule } from "../types";
import type {
  CellState,
  CompiledRow,
  TranslationApi,
  TranslationBundle,
  TranslationCellRow,
  TranslationOffering,
  TranslationSetting,
} from "./types";

export type Modality = "text" | "image" | "video" | "audio" | "embedding" | "other";

export const MODALITY_ORDER: readonly Modality[] = [
  "text",
  "image",
  "video",
  "audio",
  "embedding",
  "other",
];

export const MODALITY_LABEL: Record<Modality, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  audio: "Audio",
  embedding: "Embedding",
  other: "Other",
};

/** Mirror of aidream `modality_of` (settings_grid.py), folded to the grid's groups. */
export function modalityOfTranslator(translatorKey: string): Modality {
  const suffix = String(translatorKey).split("_").pop() ?? "";
  const server: Record<string, string> = {
    chat: "text",
    interactions: "text",
    image: "image",
    video: "video",
    embeddings: "embedding",
    stt: "audio",
    realtime: "realtime",
    live: "realtime",
  };
  return foldModality(server[suffix] ?? suffix);
}

/** The server's modality words → the grid's groups (realtime is audio here). */
export function foldModality(raw: string): Modality {
  switch (raw) {
    case "text":
    case "image":
    case "video":
    case "audio":
    case "embedding":
      return raw;
    case "realtime":
      return "audio";
    default:
      return "other";
  }
}

// ── Wire description ────────────────────────────────────────────────────────

export type WireTone = "send" | "nothing" | "drop" | "computed" | "server";

export type WireOutcome = { text: string; tone: WireTone };

const OFF_WORDS = new Set(["none", "off", "never"]);

function show(v: unknown): string {
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function sentKey(rule: ControlRule, key: string): string {
  return rule.provider_key && rule.provider_key !== key ? `${rule.provider_key} = ` : "";
}

/** Rule-wide outcomes that win over any per-value mapping. */
function ruleWide(rule: ControlRule, key: string): WireOutcome | null {
  if (rule.drop === true) return { text: "Dropped", tone: "drop" };
  if (rule.supported === false) return { text: "Converts via family", tone: "computed" };
  if (rule.processor) return { text: `Processor: ${rule.processor}`, tone: "server" };
  if (rule.const !== undefined)
    return { text: `${sentKey(rule, key)}${show(rule.const)} (fixed)`, tone: "send" };
  return null;
}

/** What the target receives for one canonical value, as this rule declares it. */
export function describeValue(rule: ControlRule, key: string, value: unknown): WireOutcome {
  const wide = ruleWide(rule, key);
  if (wide) return wide;
  const prefix = sentKey(rule, key);
  const token = typeof value === "string" ? value : JSON.stringify(value);
  const map = rule.value_map;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    if (token in map) {
      const mapped = map[token];
      return mapped === null
        ? { text: "Nothing sent", tone: "nothing" }
        : { text: `${prefix}${show(mapped)}`, tone: "send" };
    }
    if (Array.isArray(rule.to_default) && rule.to_default.map(String).includes(token)) {
      return rule.default !== undefined
        ? { text: `${prefix}${show(rule.default)} (default)`, tone: "send" }
        : { text: "Nothing sent", tone: "nothing" };
    }
    return {
      text: rule.on_unmapped ? `Unmapped: ${rule.on_unmapped}` : "Unmapped — nearest",
      tone: "computed",
    };
  }
  if (Array.isArray(rule.accepts) && !rule.accepts.map(String).includes(token)) {
    return { text: "Not accepted — nearest", tone: "computed" };
  }
  return { text: `${prefix}${token}`, tone: "send" };
}

/** What the target receives when the caller never set the key. */
export function describeUnset(rule: ControlRule, key: string): WireOutcome {
  if (rule.drop === true || rule.supported === false) return { text: "Nothing sent", tone: "nothing" };
  if (rule.const !== undefined)
    return { text: `${sentKey(rule, key)}${show(rule.const)} (fixed)`, tone: "send" };
  if (rule.send_when_unset && rule.default !== undefined)
    return { text: `${sentKey(rule, key)}${show(rule.default)} (default)`, tone: "send" };
  return { text: "Nothing sent", tone: "nothing" };
}

/** The canonical OFF value of a setting, when its vocabulary has one. */
export function offValueOf(setting: TranslationSetting | undefined): unknown {
  if (!setting) return undefined;
  if (setting.value_type === "boolean") return false;
  const values = setting.canonical_values ?? [];
  const word = values.find((v) => typeof v === "string" && OFF_WORDS.has(v));
  if (word !== undefined) return word;
  return undefined;
}

/** What the target receives when the caller turned the setting OFF. */
export function describeOff(
  rule: ControlRule,
  key: string,
  setting: TranslationSetting | undefined,
): WireOutcome | null {
  const off = rule.off;
  if (off && typeof off === "object") {
    if ("send" in off) return { text: `${sentKey(rule, key)}${show(off.send)}`, tone: "send" };
    if ("floor" in off && off.floor) return { text: "Lowest it accepts", tone: "send" };
    if ("omit" in off && off.omit)
      return { text: off.why ? `Nothing sent — ${off.why}` : "Nothing sent", tone: "nothing" };
  }
  const offValue = offValueOf(setting);
  if (offValue === undefined) return null;
  return describeValue(rule, key, offValue);
}

/** Number → value ladder lines ("≤ 4096 → low"), as declared. */
export function describeFromNumber(rule: ControlRule): { range: string; outcome: WireOutcome }[] {
  const ladder = Array.isArray(rule.from_number) ? rule.from_number : [];
  let lower: number | null = null;
  return ladder.map((step) => {
    const range =
      step.lte === null
        ? `> ${lower ?? "—"}`
        : lower === null
          ? `≤ ${step.lte}`
          : `${lower + 1}–${step.lte}`;
    if (step.lte !== null) lower = step.lte;
    const outcome: WireOutcome =
      step.to === null ? { text: "Dropped", tone: "drop" } : { text: show(step.to), tone: "send" };
    return { range, outcome };
  });
}

/** One-line summary for the grid cell. */
export function summarizeRule(rule: ControlRule): string {
  if (rule.drop === true) return "Dropped";
  if (rule.supported === false) return "Via family";
  if (rule.processor) return rule.processor;
  if (rule.const !== undefined) return `Fixed ${show(rule.const)}`;
  const parts: string[] = [];
  if (rule.provider_key) parts.push(`→ ${rule.provider_key}`);
  const mapSize =
    rule.value_map && typeof rule.value_map === "object" ? Object.keys(rule.value_map).length : 0;
  if (mapSize > 0) parts.push(`${mapSize} values`);
  if (Array.isArray(rule.from_number) && rule.from_number.length > 0)
    parts.push(`${rule.from_number.length} cut-offs`);
  if (rule.clamp && (rule.clamp.min != null || rule.clamp.max != null))
    parts.push(`${rule.clamp.min ?? "—"}–${rule.clamp.max ?? "—"}`);
  return parts.length > 0 ? parts.join(" · ") : "Native";
}

// ── Grid ────────────────────────────────────────────────────────────────────

export type GridColumn = {
  id: string;
  kind: "api" | "profile";
  ownerId: string;
  apiId: string;
  label: string;
  modality: Modality;
  /** Available offerings this column governs. */
  members: TranslationOffering[];
};

export type CellStatus = CellState | "missing";

export type GridCell = {
  key: string;
  column: GridColumn;
  /** The cell at this column's own layer. */
  cell: TranslationCellRow | null;
  /** For a profile column without its own cell: the API cell its members fall back to. */
  fallback: TranslationCellRow | null;
  /** Member models with their own offering-layer cell for this key. */
  overrides: { offering: TranslationOffering; cell: TranslationCellRow }[];
  /** Member models that resolve this key by computation (no cell anywhere). */
  missing: TranslationOffering[];
  /** Member models whose wire comes from `cell` (the approval's true reach). */
  covers: TranslationOffering[];
  status: CellStatus | null;
  needsYou: boolean;
};

export type GridTab = "needs" | "agent" | "inherited" | "all";

export const TAB_LABEL: Record<GridTab, string> = {
  needs: "Needs you",
  agent: "Decided by agent",
  inherited: "Not yet reviewed",
  all: "All",
};

export function cellNeedsYou(cell: TranslationCellRow): boolean {
  return cell.state === "proposed" || cell.conflict != null || cell.rejection_fingerprint != null;
}

export function inTab(gc: GridCell, tab: GridTab): boolean {
  if (tab === "needs") return gc.needsYou;
  if (gc.needsYou) return tab === "all";
  if (tab === "agent") return gc.cell?.state === "agent";
  if (tab === "inherited") return gc.cell?.state === "inherited";
  return gc.cell != null || gc.fallback != null || gc.overrides.length > 0;
}

export type GridRow = {
  key: string;
  family: string;
  setting: TranslationSetting | undefined;
  cells: Map<string, GridCell>;
};

export type GridModel = {
  columns: GridColumn[];
  rows: GridRow[];
  cellById: Map<string, TranslationCellRow>;
  settingByKey: Map<string, TranslationSetting>;
};

function apiLabel(api: TranslationApi): string {
  return api.display_name || api.name;
}

function consumedKeys(rule: ControlRule | undefined): string[] {
  const consumes = rule?.processor_config?.consumes;
  return Array.isArray(consumes) ? consumes.map(String) : [];
}

export function buildGrid(bundle: TranslationBundle): GridModel {
  const settingByKey = new Map(bundle.settings.map((s) => [s.key, s]));
  const cellById = new Map(bundle.cells.map((c) => [c.id, c]));
  const apiModality = new Map(
    bundle.apis.map((a) => [a.id, modalityOfTranslator(a.translator_key)]),
  );

  // Own-layer cells, addressed by (layer owner, key).
  const cellAt = new Map<string, TranslationCellRow>();
  for (const c of bundle.cells) cellAt.set(`${c.layer}:${c.layer_owner_id}:${c.setting_key}`, c);

  // The one merge's answer per offering: key → compiled row; plus declared keys (consumes).
  const compiledByOffering = new Map<string, Map<string, CompiledRow>>();
  for (const r of bundle.compiled) {
    let m = compiledByOffering.get(r.offering_id);
    if (!m) compiledByOffering.set(r.offering_id, (m = new Map()));
    m.set(r.setting_key, r);
  }
  const declaredByOffering = new Map<string, Set<string>>();
  for (const [offeringId, rows] of compiledByOffering) {
    const declared = new Set<string>();
    for (const [key, row] of rows) {
      declared.add(key);
      for (const k of consumedKeys(cellById.get(row.cell_id)?.rule)) declared.add(k);
    }
    declaredByOffering.set(offeringId, declared);
  }

  // Columns: one per settings profile, one per API (its members = offerings with no profile).
  const columns: GridColumn[] = [];
  const offeringsByApi = new Map<string, TranslationOffering[]>();
  for (const o of bundle.offerings) {
    if (o.setting_profile_id) continue;
    const list = offeringsByApi.get(o.api_id) ?? [];
    list.push(o);
    offeringsByApi.set(o.api_id, list);
  }
  for (const p of bundle.profiles) {
    columns.push({
      id: `profile:${p.id}`,
      kind: "profile",
      ownerId: p.id,
      apiId: p.api_id,
      label: p.name,
      modality: foldModality(p.modality),
      members: bundle.offerings.filter((o) => o.setting_profile_id === p.id),
    });
  }
  const apiCellOwners = new Set(bundle.cells.filter((c) => c.layer === "api").map((c) => c.layer_owner_id));
  for (const api of bundle.apis) {
    const members = offeringsByApi.get(api.id) ?? [];
    if (members.length === 0 && !apiCellOwners.has(api.id)) continue;
    columns.push({
      id: `api:${api.id}`,
      kind: "api",
      ownerId: api.id,
      apiId: api.id,
      label: apiLabel(api),
      modality: apiModality.get(api.id) ?? "other",
      members,
    });
  }
  columns.sort(
    (a, b) =>
      MODALITY_ORDER.indexOf(a.modality) - MODALITY_ORDER.indexOf(b.modality) ||
      (a.kind === b.kind ? 0 : a.kind === "profile" ? -1 : 1) ||
      a.label.localeCompare(b.label),
  );

  // Keys relevant to each modality (T1: any available offering of it declares one).
  const relevant = new Map<Modality, Set<string>>();
  for (const o of bundle.offerings) {
    const mod = apiModality.get(o.api_id) ?? "other";
    const set = relevant.get(mod) ?? new Set<string>();
    for (const k of declaredByOffering.get(o.id) ?? []) if (settingByKey.has(k)) set.add(k);
    relevant.set(mod, set);
  }

  const rowsByKey = new Map<string, GridRow>();
  const rowFor = (key: string): GridRow => {
    let row = rowsByKey.get(key);
    if (!row) {
      const setting = settingByKey.get(key);
      row = { key, family: setting?.family ?? "No family", setting, cells: new Map() };
      rowsByKey.set(key, row);
    }
    return row;
  };

  for (const column of columns) {
    const keys = new Set<string>();
    const ownLayer = column.kind;
    for (const c of bundle.cells) {
      if (c.layer === ownLayer && c.layer_owner_id === column.ownerId) keys.add(c.setting_key);
    }
    const memberIds = new Set(column.members.map((m) => m.id));
    for (const c of bundle.cells) {
      if (c.layer === "offering" && memberIds.has(c.layer_owner_id)) keys.add(c.setting_key);
    }
    if (column.kind === "profile") {
      for (const c of bundle.cells) {
        if (c.layer === "api" && c.layer_owner_id === column.apiId) keys.add(c.setting_key);
      }
    }
    for (const k of relevant.get(column.modality) ?? []) keys.add(k);

    for (const key of keys) {
      const setting = settingByKey.get(key);
      const cell = cellAt.get(`${ownLayer}:${column.ownerId}:${key}`) ?? null;
      const fallback =
        column.kind === "profile" && !cell ? (cellAt.get(`api:${column.apiId}:${key}`) ?? null) : null;
      const overrides: GridCell["overrides"] = [];
      const missing: TranslationOffering[] = [];
      const covers: TranslationOffering[] = [];
      for (const m of column.members) {
        const own = cellAt.get(`offering:${m.id}:${key}`);
        if (own) overrides.push({ offering: m, cell: own });
        const compiled = compiledByOffering.get(m.id)?.get(key);
        if (cell && compiled?.cell_id === cell.id) covers.push(m);
        const declared = declaredByOffering.get(m.id)?.has(key) ?? false;
        const probed = setting !== undefined && setting.value_type !== "object";
        if (!declared && probed && (relevant.get(column.modality)?.has(key) ?? false)) missing.push(m);
      }
      const status: CellStatus | null = cell
        ? cell.state
        : missing.length > 0
          ? "missing"
          : null;
      const needsYou =
        (cell != null && cellNeedsYou(cell)) ||
        missing.length > 0 ||
        overrides.some((o) => cellNeedsYou(o.cell));
      if (!cell && !fallback && overrides.length === 0 && missing.length === 0) continue;
      rowFor(key).cells.set(column.id, {
        key,
        column,
        cell,
        fallback,
        overrides,
        missing,
        covers,
        status,
        needsYou,
      });
    }
  }

  const rows = [...rowsByKey.values()].sort(
    (a, b) => a.family.localeCompare(b.family) || a.key.localeCompare(b.key),
  );
  return { columns, rows, cellById, settingByKey };
}

/** Counts per tab: how many grid cells each tab shows. */
export function tabCounts(model: GridModel): Record<GridTab, number> {
  const counts: Record<GridTab, number> = { needs: 0, agent: 0, inherited: 0, all: 0 };
  for (const row of model.rows) {
    for (const gc of row.cells.values()) {
      for (const tab of ["needs", "agent", "inherited", "all"] as const) {
        if (inTab(gc, tab)) counts[tab] += 1;
      }
    }
  }
  return counts;
}

/** The rows and columns a tab + modality filter actually shows (empty ones hidden). */
export function visibleSlice(
  model: GridModel,
  tab: GridTab,
  modality: Modality | "all",
  query: string,
): { columns: GridColumn[]; rows: GridRow[] } {
  const q = query.trim().toLowerCase();
  const usedColumns = new Set<string>();
  const rows: GridRow[] = [];
  for (const row of model.rows) {
    let any = false;
    for (const gc of row.cells.values()) {
      if (modality !== "all" && gc.column.modality !== modality) continue;
      if (!inTab(gc, tab)) continue;
      if (q && !row.key.toLowerCase().includes(q) && !gc.column.label.toLowerCase().includes(q))
        continue;
      usedColumns.add(gc.column.id);
      any = true;
    }
    if (any) rows.push(row);
  }
  return { columns: model.columns.filter((c) => usedColumns.has(c.id)), rows };
}

/** The canonical values a cell's preview lists (enum vocab, or the booleans). */
export function previewValues(setting: TranslationSetting | undefined, rule: ControlRule): unknown[] {
  if (!setting) return [];
  if (setting.value_type === "boolean") return [true, false];
  const base = Array.isArray(setting.canonical_values) ? setting.canonical_values : [];
  const extra = rule.value_map && typeof rule.value_map === "object" ? Object.keys(rule.value_map) : [];
  const out: unknown[] = [...base];
  for (const k of extra) if (!out.map(String).includes(k)) out.push(k);
  return out.filter((v) => v !== "auto");
}
