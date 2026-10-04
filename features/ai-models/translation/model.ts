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
 * hand list), `object`-typed settings are never probed, and the modality of a
 * listing comes from the catalog's truth (`modalityOf` — profile modality, else the
 * model's declared capabilities), never from a translator key suffix.
 */

import type { ControlRule } from "../types";
import type {
  CellState,
  CompiledRow,
  ModelCapabilities,
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

/**
 * THE modality rule — a byte-for-byte mirror of aidream `modality_of`
 * (aidream/testing/settings_grid.py, settings-translation F-c). Both run the
 * shared cases in `__tests__/modality_rule_cases.json`. Returns the SERVER's
 * word (relevance is keyed on it); `foldModality` groups it for display.
 *
 *   1. the settings profile's `modality` when the listing has one;
 *   2. else the model's declared capabilities (listing override wins):
 *      audio in, text out only (no text in) → "transcription";
 *      interaction "realtime" → "realtime"; first output among
 *      video/image/audio/embedding → it; text output → "text"; any other
 *      declared output → that word; nothing declared → "other".
 */
const OUTPUT_PRECEDENCE = ["video", "image", "audio", "embedding"] as const;

export function modalityOf(
  capabilities: ModelCapabilities | null | undefined,
  profileModality?: string | null,
): string {
  if (profileModality) return String(profileModality);
  const caps = capabilities ?? {};
  const output = (caps.output ?? []).map(String);
  const input = (caps.input ?? []).map(String);
  if (
    output.length > 0 &&
    output.every((o) => o === "text") &&
    input.includes("audio") &&
    !input.includes("text")
  ) {
    return "transcription";
  }
  if (caps.interaction === "realtime") return "realtime";
  for (const word of OUTPUT_PRECEDENCE) if (output.includes(word)) return word;
  if (output.includes("text")) return "text";
  return output.length > 0 ? [...output].sort()[0] : "other";
}

/** The server's modality words → the grid's groups (realtime and speech to text are audio here). */
export function foldModality(raw: string): Modality {
  switch (raw) {
    case "text":
    case "image":
    case "video":
    case "audio":
    case "embedding":
      return raw;
    case "realtime":
    case "transcription":
      return "audio";
    default:
      return "other";
  }
}

/**
 * An API column holds listings that may make different things (a chat API can
 * carry a TTS model): it is grouped under its most common member modality,
 * ties broken by display order. No members = "other".
 */
function dominantModality(serverWords: string[]): Modality {
  const counts = new Map<Modality, number>();
  for (const w of serverWords) {
    const m = foldModality(w);
    counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  let best: Modality = "other";
  let bestCount = 0;
  for (const m of MODALITY_ORDER) {
    const c = counts.get(m) ?? 0;
    if (c > bestCount) {
      best = m;
      bestCount = c;
    }
  }
  return best;
}

// ── Wire description ────────────────────────────────────────────────────────

export type WireTone = "send" | "nothing" | "drop" | "computed" | "server";

export type WireOutcome = { text: string; tone: WireTone };

const OFF_WORDS = new Set(["none", "off", "never"]);

function show(v: unknown): string {
  if (typeof v === "string") return v;
  return plainValue(v);
}

function sentKey(rule: ControlRule, key: string): string {
  return rule.provider_key && rule.provider_key !== key ? `${rule.provider_key} = ` : "";
}

/** Rule-wide outcomes that win over any per-value mapping. */
function ruleWide(rule: ControlRule, key: string): WireOutcome | null {
  if (rule.drop === true) return { text: "Dropped", tone: "drop" };
  if (rule.supported === false) return { text: "Converts via family", tone: "computed" };
  if (rule.processor) return { text: "Shaped by the server", tone: "server" };
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

/**
 * A declared drop says "this model has no such setting", so it never makes a key relevant to a
 * modality (a text api's image_size drop must not make image_size a missing rule on every other
 * text model). Mirror of aidream `relevant_keys_by_modality` (aidream/testing/settings_grid.py).
 */
export function ruleMakesKeyRelevant(rule: ControlRule | null | undefined): boolean {
  return rule != null && rule.drop !== true;
}

export function buildGrid(bundle: TranslationBundle): GridModel {
  const settingByKey = new Map(bundle.settings.map((s) => [s.key, s]));
  const cellById = new Map(bundle.cells.map((c) => [c.id, c]));
  // Each listing's modality, from the catalog's truth (the server's word).
  const profileModality = new Map(bundle.profiles.map((p) => [p.id, p.modality]));
  const offeringModality = new Map(
    bundle.offerings.map((o) => [
      o.id,
      modalityOf(
        o.capabilities,
        o.setting_profile_id ? profileModality.get(o.setting_profile_id) : null,
      ),
    ]),
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
      modality: dominantModality(members.map((m) => offeringModality.get(m.id) ?? "other")),
      members,
    });
  }
  columns.sort(
    (a, b) =>
      MODALITY_ORDER.indexOf(a.modality) - MODALITY_ORDER.indexOf(b.modality) ||
      (a.kind === b.kind ? 0 : a.kind === "profile" ? -1 : 1) ||
      a.label.localeCompare(b.label),
  );

  // Keys relevant to each modality (T1: any available offering of it declares a rule for it
  // that is not a declared drop — the same rule as aidream `relevant_keys_by_modality`).
  const relevant = new Map<string, Set<string>>();
  for (const o of bundle.offerings) {
    const mod = offeringModality.get(o.id) ?? "other";
    const set = relevant.get(mod) ?? new Set<string>();
    for (const [key, row] of compiledByOffering.get(o.id) ?? []) {
      const rule = cellById.get(row.cell_id)?.rule;
      if (!ruleMakesKeyRelevant(rule)) continue;
      if (settingByKey.has(key)) set.add(key);
      for (const k of consumedKeys(rule)) if (settingByKey.has(k)) set.add(k);
    }
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
    const memberModalities = new Set(column.members.map((m) => offeringModality.get(m.id) ?? "other"));
    for (const mod of memberModalities) for (const k of relevant.get(mod) ?? []) keys.add(k);

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
        const memberRelevant = relevant.get(offeringModality.get(m.id) ?? "other");
        if (!declared && probed && (memberRelevant?.has(key) ?? false)) missing.push(m);
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

// ── Plain words (the owner reads these; the raw rule stays behind "Advanced") ──

/** "reasoning_effort" → "Reasoning effort". */
export function plainSetting(key: string): string {
  const words = key.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A value as words: numbers grouped, booleans on/off, `{type: "disabled"}` → "disabled". */
export function plainValue(v: unknown): string {
  if (v === null || v === undefined) return "nothing";
  if (typeof v === "number") return v.toLocaleString("en-US");
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(plainValue).join(", ");
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 1) {
      const [k, inner] = entries[0];
      return k === "type" || k === "mode" ? plainValue(inner) : `${plainSetting(k).toLowerCase()} ${plainValue(inner)}`;
    }
    return entries.map(([k, inner]) => `${plainSetting(k).toLowerCase()} ${plainValue(inner)}`).join(", ");
  }
  return String(v);
}

function sentAs(rule: ControlRule, key: string): string {
  const target = rule.provider_key && rule.provider_key !== key ? rule.provider_key : key;
  const last = target.split(".").pop() ?? target;
  return plainSetting(last).toLowerCase();
}

/**
 * One short line saying what a rule does, in words:
 * "Off → sends thinking disabled · 5,000–11,000 → medium".
 */
export function plainRule(rule: ControlRule | null | undefined, key: string, setting?: TranslationSetting): string {
  if (!rule || Object.keys(rule).length === 0) return "No rule — the engine guesses";
  if (rule.drop === true) return "Not sent";
  if (rule.supported === false) return "Not sent — a related setting carries it";
  if (rule.const !== undefined) return `Always sends ${sentAs(rule, key)} ${plainValue(rule.const)}`;
  const parts: string[] = [];
  const off = rule.off;
  if (off && typeof off === "object") {
    if ("send" in off) parts.push(`Off → sends ${sentAs(rule, key)} ${plainValue(off.send)}`);
    else if ("floor" in off && off.floor) parts.push("Off → its lowest level");
    else if ("omit" in off && off.omit) parts.push("Off → nothing sent");
  } else {
    const offValue = offValueOf(setting);
    if (offValue !== undefined) {
      const o = describeValue(rule, key, offValue);
      if (o.tone === "nothing") parts.push("Off → nothing sent");
    }
  }
  if (rule.send_when_unset && rule.default !== undefined) parts.push(`Not set → ${plainValue(rule.default)}`);
  const ladder = Array.isArray(rule.from_number) ? rule.from_number : [];
  let lower: number | null = null;
  for (const step of ladder) {
    const to = step.to === null ? "not sent" : plainValue(step.to);
    const range =
      step.lte === null
        ? `over ${plainValue(lower ?? 0)}`
        : lower === null
          ? `up to ${plainValue(step.lte)}`
          : `${plainValue(lower + 1)}–${plainValue(step.lte)}`;
    if (step.lte !== null) lower = step.lte;
    parts.push(`${range} → ${to}`);
  }
  const map = rule.value_map && typeof rule.value_map === "object" ? rule.value_map : null;
  if (map) {
    const changed = Object.entries(map).filter(([k, v]) => k !== "auto" && v !== null && String(v) !== k);
    for (const [k, v] of changed.slice(0, 3)) parts.push(`${k} → ${plainValue(v)}`);
    if (changed.length > 3) parts.push(`${changed.length - 3} more`);
  }
  if (rule.clamp && (rule.clamp.min != null || rule.clamp.max != null)) {
    if (rule.clamp.max != null) parts.push(`capped at ${plainValue(rule.clamp.max)}`);
    else parts.push(`at least ${plainValue(rule.clamp.min)}`);
  }
  if (parts.length === 0) {
    return rule.provider_key && rule.provider_key !== key
      ? `Sent as ${sentAs(rule, key)}, unchanged`
      : "Sent unchanged";
  }
  return parts.join(" · ");
}


// ── The "Needs you" queue: one decision per row ────────────────────────────

export type QueueKind = "proposed" | "conflict" | "rejected" | "missing";

export type QueueItem = {
  id: string;
  kind: QueueKind;
  key: string;
  family: string;
  setting: TranslationSetting | undefined;
  /** Who it applies to: a settings profile, an API, or one model. */
  groupLabel: string;
  groupKind: CellLayer;
  /** The cell to decide (null for a missing rule). */
  cell: TranslationCellRow | null;
  /** The rule the next layer down would use instead (null = the engine computes). */
  without: TranslationCellRow | null;
  /** Models an approval reaches (for a missing rule: the models with no rule). */
  reach: TranslationOffering[];
  /** The grid cell it came from, for opening the editor. */
  gridCell: GridCell | null;
};

type CellLayer = TranslationCellRow["layer"];

const KIND_ORDER: Record<QueueKind, number> = { rejected: 0, conflict: 1, proposed: 2, missing: 3 };

export function buildQueue(bundle: TranslationBundle, model: GridModel): QueueItem[] {
  const profileName = new Map(bundle.profiles.map((p) => [p.id, p.name]));
  const apiName = new Map(bundle.apis.map((a) => [a.id, apiLabel(a)]));
  const offeringById = new Map(bundle.offerings.map((o) => [o.id, o]));
  const cellAt = new Map<string, TranslationCellRow>();
  for (const c of bundle.cells) cellAt.set(`${c.layer}:${c.layer_owner_id}:${c.setting_key}`, c);
  const reachOf = new Map<string, TranslationOffering[]>();
  for (const r of bundle.compiled) {
    const o = offeringById.get(r.offering_id);
    if (!o) continue;
    const list = reachOf.get(r.cell_id) ?? [];
    list.push(o);
    reachOf.set(r.cell_id, list);
  }
  const profileApi = new Map(bundle.profiles.map((p) => [p.id, p.api_id]));
  const items: QueueItem[] = [];

  for (const c of bundle.cells) {
    if (!cellNeedsYou(c)) continue;
    // A model that is not available takes no request: its rule decides nothing today.
    if (c.layer === "offering" && !offeringById.has(c.layer_owner_id)) continue;
    let groupLabel = c.layer_owner_id;
    let without: TranslationCellRow | null = null;
    if (c.layer === "profile") {
      groupLabel = profileName.get(c.layer_owner_id) ?? groupLabel;
      const api = profileApi.get(c.layer_owner_id);
      without = api ? (cellAt.get(`api:${api}:${c.setting_key}`) ?? null) : null;
    } else if (c.layer === "api") {
      groupLabel = apiName.get(c.layer_owner_id) ?? groupLabel;
    } else {
      const o = offeringById.get(c.layer_owner_id);
      groupLabel = o?.model_name ?? groupLabel;
      if (o?.setting_profile_id) without = cellAt.get(`profile:${o.setting_profile_id}:${c.setting_key}`) ?? null;
      if (!without && o) without = cellAt.get(`api:${o.api_id}:${c.setting_key}`) ?? null;
    }
    const setting = model.settingByKey.get(c.setting_key);
    items.push({
      id: c.id,
      kind: c.rejection_fingerprint ? "rejected" : c.conflict ? "conflict" : "proposed",
      key: c.setting_key,
      family: setting?.family ?? "No family",
      setting,
      groupLabel,
      groupKind: c.layer,
      cell: c,
      without,
      reach: reachOf.get(c.id) ?? [],
      gridCell: null,
    });
  }

  for (const row of model.rows) {
    for (const gc of row.cells.values()) {
      if (gc.cell || gc.missing.length === 0) continue;
      items.push({
        id: `missing:${gc.column.id}:${gc.key}`,
        kind: "missing",
        key: gc.key,
        family: row.family,
        setting: row.setting,
        groupLabel: gc.column.label,
        groupKind: gc.column.kind,
        cell: null,
        without: gc.fallback,
        reach: gc.missing,
        gridCell: gc,
      });
    }
  }

  return items.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.groupLabel.localeCompare(b.groupLabel) ||
      a.key.localeCompare(b.key),
  );
}
