/**
 * Config persistence.
 *
 * Deliberately `localStorage` for now: the config SHAPE is still moving, and a
 * database table for a schema about to change is churn. What this buys today is
 * the thing that matters — turn a knob, reload, the knob is still turned — plus
 * import/export so a tuned config can be mailed to someone or committed.
 *
 * The moment the shape settles, this becomes an org-scoped table with a version
 * stamped onto every evaluation, because "auditable spend" means being able to
 * explain a price you quoted six months ago.
 */

import type { LinkValuationConfig } from "./types";
import { SHEET_2018_CONFIG } from "./configs/sheet-2018";
import { MATRX_V1_CONFIG } from "./configs/matrx-v1";

const STORAGE_KEY = "matrx.link-valuation.configs.v1";
const ACTIVE_KEY = "matrx.link-valuation.active.v1";

/** The configs that ship with the code and can always be returned to. */
export const BUILT_IN_CONFIGS: readonly LinkValuationConfig[] = [
  MATRX_V1_CONFIG,
  SHEET_2018_CONFIG,
];

export function isBuiltIn(id: string): boolean {
  return BUILT_IN_CONFIGS.some((config) => config.id === id);
}

/** `typeof null === "object"` and so is an array. Neither is a config object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOverrides(): Record<string, LinkValuationConfig> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, LinkValuationConfig>;
  } catch {
    // A corrupt blob must never take the page down — fall back to the built-ins
    // and let the user re-tune rather than showing them an error screen.
    return {};
  }
}

export function listConfigs(): LinkValuationConfig[] {
  const overrides = readOverrides();
  const merged = BUILT_IN_CONFIGS.map(
    (config) => overrides[config.id] ?? config,
  );
  for (const [id, config] of Object.entries(overrides)) {
    if (!isBuiltIn(id)) merged.push(config);
  }
  return merged;
}

export function loadConfig(id: string): LinkValuationConfig | null {
  return listConfigs().find((config) => config.id === id) ?? null;
}

export function saveConfig(config: LinkValuationConfig): void {
  if (typeof window === "undefined") return;
  const overrides = readOverrides();
  overrides[config.id] = config;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

/** Drop local edits and return to the shipped version of a built-in config. */
export function resetConfig(id: string): LinkValuationConfig | null {
  if (typeof window === "undefined") return null;
  const overrides = readOverrides();
  delete overrides[id];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  return BUILT_IN_CONFIGS.find((config) => config.id === id) ?? null;
}

export function hasLocalEdits(id: string): boolean {
  return Object.keys(readOverrides()).includes(id);
}

export function readActiveConfigId(): string {
  if (typeof window === "undefined") return MATRX_V1_CONFIG.id;
  return window.localStorage.getItem(ACTIVE_KEY) ?? MATRX_V1_CONFIG.id;
}

export function writeActiveConfigId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
}

/**
 * Import a config from pasted JSON. Returns a message rather than throwing,
 * because the caller is a person pasting text and "what exactly is wrong" is
 * the only useful answer.
 */
export function parseConfig(
  text: string,
): { config: LinkValuationConfig } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `That is not valid JSON: ${(error as Error).message}` };
  }
  if (!parsed || typeof parsed !== "object")
    return { error: "Expected a JSON object." };

  const candidate = parsed as Partial<LinkValuationConfig>;

  const requiredStrings: (keyof LinkValuationConfig)[] = ["id", "name"];
  const missingStrings = requiredStrings.filter(
    (key) => typeof candidate[key] !== "string" || candidate[key] === "",
  );
  if (missingStrings.length > 0) {
    return {
      error: `Missing or non-text field(s): ${missingStrings.join(", ")}.`,
    };
  }

  // Every collection the engine ITERATES must be an array before it is accepted.
  // Accepting a config missing `groups` or `gates` and discovering it inside the
  // engine blanks the whole workspace with no way back — validation belongs at
  // the door, not in the maths.
  const requiredArrays: (keyof LinkValuationConfig)[] = [
    "signals",
    "groups",
    "terms",
    "buckets",
    "gates",
  ];
  const badArrays = requiredArrays.filter(
    (key) => !Array.isArray(candidate[key]),
  );
  if (badArrays.length > 0) {
    return { error: `These must each be an array: ${badArrays.join(", ")}.` };
  }

  const money = candidate.money;
  if (!money || typeof money !== "object")
    return { error: "Missing the `money` block." };
  if (!Array.isArray(money.curve) || money.curve.length === 0) {
    return {
      error: "`money.curve` must be a non-empty array of { at, value } points.",
    };
  }
  if (!Array.isArray(money.roles) || !Array.isArray(money.authorization)) {
    return {
      error: "`money.roles` and `money.authorization` must each be an array.",
    };
  }
  if (!isPlainObject(candidate.labels)) {
    return { error: "`labels` must be an object of label sets." };
  }
  for (const [key, set] of Object.entries(candidate.labels)) {
    if (
      !isPlainObject(set) ||
      !Array.isArray((set as { bands?: unknown }).bands)
    ) {
      return { error: `Label set "${key}" needs a \`bands\` array.` };
    }
  }

  return { config: candidate as LinkValuationConfig };
}
