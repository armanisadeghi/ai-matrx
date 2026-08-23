/**
 * Provision shapes — the PURE half of the client Provision model: types, the
 * one consumption-map deserializer, ingress parsers for the wave-1 mandate /
 * binding columns, and the client pre-flight. A LEAF module on purpose (the
 * `contract.ts` pattern): both the client resolver (`service.ts`) and the SSR
 * twin (`service.server.ts`) read these shapes, so nothing here may touch the
 * browser client — reads live in `./provisions.ts`.
 *
 * A **Provision** (`agent.provision`, code-declared in aidream) lists ALL
 * values available at a call site: each named, typed by a kind slug (a
 * registered content_ir kind or a generic scalar), guaranteed|optional and
 * eager|lazy. It is the mandate's ENTIRE input declaration — a mandate with a
 * `provision_key` declares no required input variables of its own.
 *
 * The consumption side lives on the BINDING (`agent.mandate_binding
 * .consumption_map`): which offered values the bound Holder consumes, each
 * delivered as `variable` (immutable, turn-1, prompt-substituted) or
 * `context` (mutable, context-policy path). Bind rule (Arman, 2026-08-22):
 * **everything consumed must be offered** — unused offered values are NORMAL,
 * never a warning. Server truth: aidream
 * `aidream/services/mandates/provisions.py`; rulings:
 * `common-docs/systems/agents/mandates/FEATURE.md` (2026-08-22).
 *
 * ── LOCAL DB-TYPE NOTE — the wave-1 columns predate the generated types ─────
 * `mandate.provision_key/pins/pinned_context` and `mandate_binding
 * .holder_type/consumption_map` are LIVE (verified against information_schema
 * on 2026-08-22) but missing from `types/database.types.ts`: the Supabase CLI
 * needs an access token this environment doesn't have, and the direct
 * `--db-url` path is blocked by the HTTPS-only network. Until `pnpm db-types`
 * runs, rows are read with `select("*")` and the extra columns are narrowed
 * HERE at ingress with runtime validation — never a cast on the row.
 */

import type { Json } from "@/types/database.types";
import { isJsonObject, type JsonObject } from "@/types/json";
import type { ValueMapping } from "@/features/surfaces/types";

// ── Kind vocabulary (mirrors aidream provisions.py — the one law) ────────────

/** Kind slugs whose values are prompt-substitutable scalars. Anything else is
 * STRUCTURED and may only be delivered as `context` — never serialized into a
 * single blob variable. Mirror of aidream `SCALAR_VALUE_KINDS`. */
export const SCALAR_VALUE_KINDS: ReadonlySet<string> = new Set([
  "text",
  "string",
  "markdown",
  "number",
  "integer",
  "boolean",
]);

/** THE MEDIA CHANNEL (aidream, 2026-08-22): `file` is ONE durable media
 * reference (a file id, or a MediaRef wire object `{file_id | url | file_uri,
 * mime_type?}` — never a signed URL, never inline bytes); `file_list` is an
 * ordered list of them. The one family besides scalars that may be delivered
 * as a `variable` — it becomes the turn's image block, never text. As
 * `context` it is a context entry carrying the durable ref. Mirror of aidream
 * `MEDIA_VALUE_KINDS`. */
export const MEDIA_VALUE_KINDS: ReadonlySet<string> = new Set([
  "file",
  "file_list",
]);

/** Generic slugs with fixed schemas — NOT registered content_ir kinds, so a
 * kind chip for one never links to `/shapes/[kind]`. Mirror of aidream
 * `GENERIC_VALUE_SCHEMAS`. */
export const GENERIC_VALUE_KINDS: ReadonlySet<string> = new Set([
  ...SCALAR_VALUE_KINDS,
  ...MEDIA_VALUE_KINDS,
  "string_list",
  "json",
]);

/** Code-owned levers a mandate may PIN — mirror of aidream
 * `ALLOWED_PIN_KEYS`. Model/provider selections are NEVER pins (models change
 * constantly; code must never reference them). */
export const ALLOWED_PIN_KEYS: ReadonlySet<string> = new Set([
  "reasoning",
  "streaming",
]);

// ── Offered values ───────────────────────────────────────────────────────────

export interface OfferedValue {
  name: string;
  /** Kind slug: a registered content_ir kind, or a generic scalar slug. */
  kind: string;
  /** Guaranteed values arrive on every launch; optional ones may be absent. */
  guaranteed: boolean;
  /** Lazy values ship as a reference until actually consumed. */
  lazy: boolean;
  description: string;
}

/** Runtime-validate `agent.provision.offered_values` (ingress validation —
 * junk entries are dropped LOUDLY, never silently rendered). */
export function parseOfferedValues(raw: Json | unknown): OfferedValue[] {
  if (!Array.isArray(raw)) {
    if (raw != null) {
      console.error(
        "[provisions] offered_values is not an array — data defect on agent.provision",
        raw,
      );
    }
    return [];
  }
  const out: OfferedValue[] = [];
  for (const entry of raw) {
    if (
      isJsonObject(entry) &&
      typeof entry.name === "string" &&
      typeof entry.kind === "string"
    ) {
      out.push({
        name: entry.name,
        kind: entry.kind,
        guaranteed: entry.guaranteed !== false,
        lazy: entry.lazy === true,
        description:
          typeof entry.description === "string" ? entry.description : "",
      });
    } else {
      console.error(
        "[provisions] dropping malformed offered_values entry",
        entry,
      );
    }
  }
  return out;
}

// ── Consumption map (the binding's zero-code rewiring surface) ───────────────

/** One consumed offered value — the neutral `offered_value` branch of the
 * shared `ValueMapping` union (`features/surfaces/types.ts`). */
export type ConsumptionEntry = Extract<
  ValueMapping,
  { mapType: "offered_value" }
>;

/** offered value name → how this Holder consumes it. */
export type ConsumptionMap = Record<string, ConsumptionEntry>;

const WHEN_ABSENT_VALUES = new Set(["skip", "use_default", "fail"]);

/**
 * THE one client-side deserializer for a persisted consumption map. Legacy
 * `code_value` entries normalize to the neutral `offered_value` (mirrors
 * aidream `parse_value_mapping` — normalize on read, ONE funnel); any other
 * mapType is not consumable and is dropped loudly.
 */
export function parseConsumptionMap(raw: Json | unknown): ConsumptionMap {
  if (raw == null) return {};
  if (!isJsonObject(raw)) {
    console.error(
      "[provisions] consumption_map is not an object — data defect on agent.mandate_binding",
      raw,
    );
    return {};
  }
  const out: ConsumptionMap = {};
  for (const [name, entry] of Object.entries(raw)) {
    if (!isJsonObject(entry)) {
      console.error("[provisions] dropping malformed consumption entry", name);
      continue;
    }
    const mapType = entry.mapType;
    if (mapType !== "offered_value" && mapType !== "code_value") {
      console.error(
        `[provisions] consumption_map entry ${name} has mapType ${String(mapType)} — not consumable, dropping`,
      );
      continue;
    }
    const target = typeof entry.target === "string" ? entry.target : name;
    const deliver = entry.deliver === "context" ? "context" : "variable";
    const whenAbsent =
      typeof entry.when_absent === "string" &&
      WHEN_ABSENT_VALUES.has(entry.when_absent)
        ? (entry.when_absent as ConsumptionEntry["when_absent"])
        : undefined;
    out[name] = {
      mapType: "offered_value",
      target,
      deliver,
      ...(entry.required === true ? { required: true } : {}),
      ...(whenAbsent ? { when_absent: whenAbsent } : {}),
      ...(entry.default !== undefined && entry.default !== null
        ? { default: entry.default }
        : {}),
    };
  }
  return out;
}

// ── Wave-1 mandate / binding columns (runtime-narrowed off `select("*")`) ────

export interface MandateWave1Fields {
  /** The provision this mandate's inputs come from — null for legacy mandates. */
  provisionKey: string | null;
  /** Code-owned levers only (`ALLOWED_PIN_KEYS`) — never a model id. */
  pins: JsonObject;
  /** Offered values force-delivered as context. */
  pinnedContext: string[];
}

/** Narrow the wave-1 mandate columns off a full `select("*")` row. The
 * generated Row type predates them (see the header) — the raw response object
 * carries them at runtime; unknown/malformed shapes degrade to empty. */
export function parseMandateWave1(row: object): MandateWave1Fields {
  const raw: Record<string, unknown> = { ...row };
  const pins = isJsonObject(raw.pins) ? { ...raw.pins } : {};
  for (const key of Object.keys(pins)) {
    if (!ALLOWED_PIN_KEYS.has(key)) {
      // The pins law: code-owned levers only, and NO model references, ever.
      // A stray key is a data defect — never rendered as a pin.
      console.error(
        `[provisions] mandate pin ${key} is not an allowed code-owned lever — ignoring (allowed: ${[...ALLOWED_PIN_KEYS].join(", ")})`,
      );
      delete pins[key];
    }
  }
  return {
    provisionKey:
      typeof raw.provision_key === "string" && raw.provision_key.length > 0
        ? raw.provision_key
        : null,
    pins,
    pinnedContext: Array.isArray(raw.pinned_context)
      ? raw.pinned_context.filter((v): v is string => typeof v === "string")
      : [],
  };
}

export interface BindingWave1Fields {
  /** 'agent' | 'workflow' — only agent Holders execute in this wave. */
  holderType: "agent" | "workflow";
  consumptionMap: ConsumptionMap;
}

/** Narrow the wave-1 binding columns off a full `select("*")` row. */
export function parseBindingWave1(row: object | null): BindingWave1Fields {
  if (row == null) return { holderType: "agent", consumptionMap: {} };
  const raw: Record<string, unknown> = { ...row };
  return {
    holderType: raw.holder_type === "workflow" ? "workflow" : "agent",
    consumptionMap: parseConsumptionMap(raw.consumption_map),
  };
}

// ── Client pre-flight for a consumption-map draft ────────────────────────────

/** Minimal offer surface the pre-flight needs (satisfied by
 * `ProvisionOffer` in `./provisions.ts`). */
export interface OfferLike {
  values: readonly OfferedValue[];
}

/** Problems that would 422 at the server — surfaced instantly in the editor.
 * The server's bind-time verdict remains the authority. */
export function consumptionMapProblems(
  offer: OfferLike,
  map: ConsumptionMap,
): string[] {
  const offered = new Map(offer.values.map((v) => [v.name, v]));
  const problems: string[] = [];
  for (const [name, entry] of Object.entries(map)) {
    const source = entry.target || name;
    const value = offered.get(source);
    if (!value) {
      problems.push(
        `"${name}" consumes "${source}", which this provision does not offer`,
      );
      continue;
    }
    if (!value.guaranteed && !entry.when_absent) {
      problems.push(
        `"${name}" is optional — choose what happens when it is absent (skip, use a default, or fail)`,
      );
    }
    if (entry.when_absent === "use_default" && entry.default == null) {
      problems.push(`"${name}" says "use a default" but no default is set`);
    }
    if (
      (entry.deliver ?? "variable") === "variable" &&
      !SCALAR_VALUE_KINDS.has(value.kind) &&
      !MEDIA_VALUE_KINDS.has(value.kind)
    ) {
      problems.push(
        `"${name}" has structured kind "${value.kind}" — deliver it as context, never as a blob variable`,
      );
    }
  }
  return problems;
}
