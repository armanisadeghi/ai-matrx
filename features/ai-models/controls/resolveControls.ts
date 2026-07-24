/**
 * Pure client mirror of `ai.resolve_model_config` (aidream ai_041/ai_049) —
 * per-key rule merge, provenance, and resolved-control derivation.
 *
 * The DB function stays the ground truth (`ai.model_config` view); this module
 * exists so the admin Controls editor can (a) show provenance chips per rule
 * fact, (b) preview resolution for a NON-preferred offering (the SQL resolves
 * the preferred offering only), and (c) validate the auto/none law before save.
 *
 * Mirrored semantics (keep in lockstep with the SQL):
 * - merge: shallow field-level `||` — override field wins over family field
 * - `supported: false` → control is hidden (not rendered to users)
 * - key missing from `ai.setting` → never resolves (unknown key)
 * - clamp INTERSECTS canonical range (greatest min, least max)
 * - `max_output_tokens` additionally capped at model.max_tokens
 * - default precedence: const > rule.default > setting.default_value
 * - enum precedence: ui_values > identity value_map keys (canonical order)
 *   > const > setting.canonical_values (enum type only)
 */

import type {
  AiSetting,
  ControlParam,
  ControlProvenance,
  ControlRule,
  RulesParams,
} from "../types";

export const RULE_FIELDS: (keyof ControlRule)[] = [
  "provider_key",
  "value_map",
  "on_unmapped",
  "clamp",
  "supported",
  "default",
  "send_when_unset",
  "const",
  "processor",
  "processor_config",
  "ui_values",
];

/** Field-level merge, override wins — mirror of the SQL `||`. */
export function mergeRule(
  family: ControlRule | undefined,
  override: ControlRule | undefined,
): ControlRule {
  return { ...(family ?? {}), ...(override ?? {}) };
}

export function provenanceForKey(
  key: string,
  familyParams: RulesParams,
  overrideParams: RulesParams,
  settingByKey: Map<string, AiSetting>,
): ControlProvenance {
  const fields = (rule: ControlRule | undefined): (keyof ControlRule)[] =>
    rule ? RULE_FIELDS.filter((f) => rule[f] !== undefined) : [];
  return {
    family: fields(familyParams[key]),
    override: fields(overrideParams[key]),
    known: settingByKey.has(key),
  };
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Client mirror of the SQL per-key resolution. Returns null when the control
 *  would not resolve (unsupported / unknown setting key). */
export function resolveControlForKey(
  key: string,
  mergedRule: ControlRule,
  setting: AiSetting | undefined,
  modelMaxTokens: number | null | undefined,
): ControlParam | null {
  if (mergedRule.supported === false) return null;
  if (!setting) return null;

  const type = setting.value_type ?? "string";
  let min = toNumber(setting.canonical_min);
  let max = toNumber(setting.canonical_max);

  if (mergedRule.clamp && typeof mergedRule.clamp === "object") {
    const cMin = toNumber(mergedRule.clamp.min);
    const cMax = toNumber(mergedRule.clamp.max);
    if (cMin !== null) min = min === null ? cMin : Math.max(min, cMin);
    if (cMax !== null) max = max === null ? cMax : Math.min(max, cMax);
  }

  if (key === "max_output_tokens" && modelMaxTokens && modelMaxTokens > 0) {
    max = max === null ? modelMaxTokens : Math.min(max, modelMaxTokens);
  }

  let def: unknown;
  if (mergedRule.const !== undefined) def = mergedRule.const;
  else if (mergedRule.default !== undefined) def = mergedRule.default;
  else def = setting.default_value;

  // Enum derivation — native vocabulary law (ai_041).
  let enumValues: unknown[] | null = null;
  if (Array.isArray(mergedRule.ui_values)) {
    enumValues = mergedRule.ui_values;
  } else if (
    mergedRule.value_map &&
    typeof mergedRule.value_map === "object" &&
    !Array.isArray(mergedRule.value_map)
  ) {
    const canonical = Array.isArray(setting.canonical_values)
      ? setting.canonical_values.map(String)
      : [];
    const identity = Object.entries(mergedRule.value_map)
      .filter(([k, v]) => v === k)
      .map(([k]) => k);
    identity.sort((a, b) => {
      const ia = canonical.indexOf(a);
      const ib = canonical.indexOf(b);
      const oa = ia === -1 ? Number.MAX_SAFE_INTEGER : ia;
      const ob = ib === -1 ? Number.MAX_SAFE_INTEGER : ib;
      return oa - ob || a.localeCompare(b);
    });
    enumValues = identity;
  } else if (mergedRule.const !== undefined) {
    enumValues = [mergedRule.const];
  } else if (type === "enum" && Array.isArray(setting.canonical_values)) {
    enumValues = setting.canonical_values;
  }

  // Special cases mirrored from the SQL.
  if (
    key === "tts_voice" &&
    !Array.isArray(mergedRule.ui_values) &&
    !(mergedRule.value_map && typeof mergedRule.value_map === "object")
  ) {
    const ctrl: ControlParam = { type: "dynamic", source: "api" };
    if (max !== null) ctrl.max = max;
    if (def !== undefined && def !== null) ctrl.default = def;
    return ctrl;
  }
  if (key === "multi_speaker") {
    const ctrl: ControlParam = { allowed: (max ?? 1) > 1 };
    if (max !== null) ctrl.max = max;
    return ctrl;
  }

  const ctrl: ControlParam = {
    type: (enumValues !== null ? "enum" : type) as ControlParam["type"],
  };
  if (min !== null) ctrl.min = min;
  if (max !== null) ctrl.max = max;
  if (enumValues !== null) ctrl.enum = enumValues;
  if (def !== undefined && def !== null) ctrl.default = def;
  return ctrl;
}

/** The auto/none wire law (ai_041 §2): a `value_map` must never send a
 *  concrete provider value for the house tokens — identity or null only.
 *  Returns human-readable violation messages (empty = clean). */
export function validateAutoNoneLaw(rule: ControlRule): string[] {
  const issues: string[] = [];
  const vm = rule.value_map;
  if (vm && typeof vm === "object" && !Array.isArray(vm)) {
    for (const token of ["auto", "none"] as const) {
      if (token in vm) {
        const mapped = vm[token];
        if (mapped !== null && mapped !== token) {
          issues.push(
            `value_map maps "${token}" to ${JSON.stringify(mapped)} — the house token must map to itself or null (auto = omit key, none = never send).`,
          );
        }
      }
    }
  }
  return issues;
}

/** One row of the editor: everything the UI needs about a single setting key. */
export type ControlRowModel = {
  key: string;
  setting: AiSetting | undefined;
  familyRule: ControlRule | undefined;
  overrideRule: ControlRule | undefined;
  merged: ControlRule;
  resolved: ControlParam | null;
  provenance: ControlProvenance;
};

export function buildControlRows(
  familyParams: RulesParams,
  overrideParams: RulesParams,
  settings: AiSetting[],
  modelMaxTokens: number | null | undefined,
): ControlRowModel[] {
  // is_system rows win on key collision — mirror of `order by is_system desc`.
  const settingByKey = new Map<string, AiSetting>();
  for (const s of settings) {
    const existing = settingByKey.get(s.key);
    if (!existing || (s.is_system && !existing.is_system)) {
      settingByKey.set(s.key, s);
    }
  }
  const keys = Array.from(
    new Set([...Object.keys(familyParams), ...Object.keys(overrideParams)]),
  ).sort();
  return keys.map((key) => {
    const familyRule = familyParams[key];
    const overrideRule = overrideParams[key];
    const merged = mergeRule(familyRule, overrideRule);
    const setting = settingByKey.get(key);
    return {
      key,
      setting,
      familyRule,
      overrideRule,
      merged,
      resolved: resolveControlForKey(key, merged, setting, modelMaxTokens),
      provenance: provenanceForKey(
        key,
        familyParams,
        overrideParams,
        settingByKey,
      ),
    };
  });
}
