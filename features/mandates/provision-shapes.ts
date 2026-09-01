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
 * `common-docs/systems/mandates/FEATURE.md` (2026-08-22).
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
  /**
   * 🚨 D2 (Arman, 2026-08-31) — ONE STATIC EXAMPLE of what this value looks
   * like, declared once with the provision (or with a described input).
   *
   * UI-STANDARD P5 ("the real current value is on the screen") was the single
   * mechanic the mandate side could not do AT ALL, because an offered value
   * carried no value field by construction — so a person choosing where a
   * value should land chose from prose alone. This is the static half of the
   * fix, and static is the point: it works in admin where no live page exists
   * and it costs nothing at run time.
   *
   * It is an ILLUSTRATION, never a default and never a fallback. Nothing reads
   * it at run time on either side of the wire, so it can never leak into an
   * answer. Absent or `""` means none was declared — say nothing, never invent
   * one. (Optional so a declaration that has no example stays a two-line
   * literal; every reader treats absent and empty identically.)
   */
  example?: string;
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
        example: typeof entry.example === "string" ? entry.example : "",
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

/**
 * ONE SOURCE feeding one holder input — the three branches of the shared
 * `ValueMapping` union a job binding can STORE.
 *
 * 🚨 THE FOUR SOURCES, and where the fourth went. The shared row component
 * offers `Holder Default | Offered Value | Direct Value | Prompt User`. Three
 * of them are stored here; "holder default" is simply ABSENCE from the map —
 * there is nothing to write, because a job binding has no auto-name-match pass
 * to suppress.
 *
 * Until 2026-08-31 the server accepted `offered_value` alone, so the two others
 * were refused in the UI with a stand-in message. That stopgap is DELETED:
 * `aidream/services/mandates/provisions.py` validates and materializes all
 * three (a literal is the binding's own content; a `prompt_user` target is
 * served as a real named field on the mandate's input surface, so the run form
 * asks the question and the answer arrives by that name).
 */
export type ConsumptionEntry = Extract<
  ValueMapping,
  { mapType: "offered_value" | "direct_value" | "prompt_user" }
>;

/** Narrow to the branch that consumes something the JOB offers. */
export function isOfferedSource(
  entry: ConsumptionEntry,
): entry is Extract<ValueMapping, { mapType: "offered_value" }> {
  return entry.mapType === "offered_value";
}

/** The delivery channel of any source — absent reads as `variable`, which is
 * what every consumer already assumed. */
export function sourceChannel(
  entry: ConsumptionEntry,
): "variable" | "context" {
  return entry.deliver === "context" ? "context" : "variable";
}

/** One line naming what this source IS, in the reader's words — never the DSL.
 * The ONE place a stored source becomes a sentence, so the offered rail, the
 * strip and the auto-run bar cannot describe the same entry differently. */
export function describeSource(entry: ConsumptionEntry): string {
  switch (entry.mapType) {
    case "offered_value":
      return `the offered value "${entry.target}"`;
    case "direct_value":
      return typeof entry.target === "string"
        ? `a fixed value: "${entry.target}"`
        : `a fixed value: ${JSON.stringify(entry.target)}`;
    case "prompt_user":
      return `an answer from the person: "${entry.prompt}"`;
  }
}

/**
 * HOLDER INPUT name (variable / context-policy key) → the ORDERED sources that
 * feed it. `entry.target` names the SOURCE offered value (defaults to the key)
 * — the map is target-centric on the wire; docs claiming "keyed by offered
 * value" were corrected 2026-08-26.
 *
 * 🚨 D18.2 — MANY-TO-ONE (Arman, 2026-08-30). A provision may offer fifty
 * values while the bound agent has two variables, so a target's value is a
 * LIST: several offered values are concatenated into that input's text, in
 * this order, separated by a blank line (`MULTI_SOURCE_JOINER`). The shape is
 * a list even for one source so no consumer has to branch; the WIRE keeps
 * emitting a bare object for a single source (`consumptionMapForApi`), which
 * is why every binding written before 2026-08-31 keeps its exact meaning.
 */
export type ConsumptionMap = Record<string, ConsumptionEntry[]>;

/**
 * The separator D18.2 names: "joined with a blank line". A constant, never a
 * knob — a knob would let two deployments disagree about what one stored
 * mapping means. Mirror of aidream `provisions.MULTI_SOURCE_JOINER`.
 */
export const MULTI_SOURCE_JOINER = "\n\n";

/** The ordered sources feeding one target — [] when nothing feeds it. */
export function sourcesFor(
  map: ConsumptionMap,
  targetName: string,
): ConsumptionEntry[] {
  return map[targetName] ?? [];
}

const WHEN_ABSENT_VALUES = new Set(["skip", "use_default", "fail"]);

/**
 * THE one client-side deserializer for a persisted consumption map. Legacy
 * `surface_value` and legacy `code_value` entries normalize to the neutral
 * `offered_value` (mirrors aidream `parse_value_mapping` — normalize on read,
 * ONE funnel). `surface_value` is the shared binding writer's persisted word
 * for "take the value this call site offers"; a mandate Provision is that
 * call site, so dropping it loses a valid binding. Any other mapType is not
 * consumable and is dropped loudly.
 */
export function parseConsumptionMap(raw: Json | unknown): ConsumptionMap {
  return parseConsumptionMapWithDrops(raw).map;
}

/**
 * The same parse, plus WHAT IT THREW AWAY, in sentences a person can read.
 *
 * 🚨 The loud-patches law, pointed at this function (V2 finding G6): every drop
 * below screams into the console — 79 times in one of the adversary's sessions
 * — and the SCREEN said nothing. Stored mapping data was being discarded on
 * load with no red cell, no notice, no "this place had a mapping this screen
 * cannot read". A stand-in that screams only where no user will ever look is
 * the law inverted. The console stays (it is for us); the reasons now travel
 * to whoever renders the map, so the person can be told too.
 */
export function parseConsumptionMapWithDrops(raw: Json | unknown): {
  map: ConsumptionMap;
  dropped: string[];
} {
  const dropped: string[] = [];
  if (raw == null) return { map: {}, dropped };
  if (!isJsonObject(raw)) {
    console.error(
      "[provisions] consumption_map is not an object — data defect on agent.mandate_binding",
      raw,
    );
    return {
      map: {},
      dropped: [
        "This binding's stored mapping is not readable at all — the whole map was ignored.",
      ],
    };
  }
  const out: ConsumptionMap = {};
  for (const [name, raws] of Object.entries(raw)) {
    // D18.2 — a target's value is a LIST of ordered sources, and a bare object
    // is the one-source form every pre-2026-08-31 row was written in.
    const elements = Array.isArray(raws) ? raws : [raws];
    const sources: ConsumptionEntry[] = [];
    for (const entry of elements) {
      if (!isJsonObject(entry)) {
        console.error("[provisions] dropping malformed consumption entry", name);
        dropped.push(`${name}: one stored source is malformed and was ignored.`);
        continue;
      }
      const mapType = entry.mapType;
      const deliver = entry.deliver === "context" ? "context" : "variable";
      if (mapType === "direct_value") {
        // A literal written on the binding. `null`/absent is not a literal —
        // it feeds nothing, and storing it would be an invisible empty answer.
        if (entry.target === undefined || entry.target === null) {
          console.error(
            `[provisions] consumption_map entry ${name} is a fixed value with nothing in it — dropping`,
          );
          dropped.push(
            `${name}: a fixed value with nothing in it was ignored.`,
          );
          continue;
        }
        sources.push({ mapType: "direct_value", target: entry.target, deliver });
        continue;
      }
      if (mapType === "prompt_user") {
        // A question with no words is a blank box nobody can answer.
        const prompt = typeof entry.prompt === "string" ? entry.prompt : "";
        if (!prompt.trim()) {
          console.error(
            `[provisions] consumption_map entry ${name} asks the person with no question — dropping`,
          );
          dropped.push(
            `${name}: a question with no words was ignored — nobody could have answered it.`,
          );
          continue;
        }
        sources.push({
          mapType: "prompt_user",
          prompt,
          deliver,
          ...(entry.required === true ? { required: true } : {}),
          ...(entry.defaultValue !== undefined && entry.defaultValue !== null
            ? { defaultValue: entry.defaultValue }
            : {}),
        });
        continue;
      }
      if (
        mapType !== "offered_value" &&
        mapType !== "surface_value" &&
        mapType !== "code_value"
      ) {
        console.error(
          `[provisions] consumption_map entry ${name} has mapType ${String(mapType)} — not consumable, dropping`,
        );
        dropped.push(
          `${name}: a stored source of kind "${String(mapType)}" is not something this screen can feed an input, and was ignored.`,
        );
        continue;
      }
      const target = typeof entry.target === "string" ? entry.target : name;
      const whenAbsent =
        typeof entry.when_absent === "string" &&
        WHEN_ABSENT_VALUES.has(entry.when_absent)
          ? (entry.when_absent as Extract<
              ConsumptionEntry,
              { mapType: "offered_value" }
            >["when_absent"])
          : undefined;
      sources.push({
        mapType: "offered_value",
        target,
        deliver,
        ...(entry.required === true ? { required: true } : {}),
        ...(whenAbsent ? { when_absent: whenAbsent } : {}),
        ...(entry.default !== undefined && entry.default !== null
          ? { default: entry.default }
          : {}),
      });
    }
    // A target whose every source was junk feeds nothing — it is not a target.
    if (sources.length > 0) out[name] = sources;
  }
  return { map: out, dropped };
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

// ── THE HOLDER LAW — what THIS repo's client resolver can run ───────────────

/**
 * Holder types the BROWSER-SIDE resolver may run.
 *
 * 🚨 This is a limit of the CLIENT path, not of the platform. Workflow Holders
 * execute end to end on the server (`aidream/services/mandates/
 * workflow_holder.py`): the workflow runs as a child run and answers with the
 * deliverable whose kind is the mandate's output kind. But the client resolver
 * exists to hand `POST /agents/{id}` an agent id — it has no channel to start
 * a workflow run — so a workflow-bound mandate resolved HERE must refuse
 * loudly and name the real reason. Silently falling back to the system default
 * would run the wrong intelligence behind the user's back.
 */
export const EXECUTABLE_HOLDER_TYPES: ReadonlySet<string> = new Set(["agent"]);

/** Which layer of the resolution walk a binding came from. */
export type MandateBindingLayer = "organization" | "user";

/**
 * The ONE refusal message for a binding whose Holder cannot execute. Names the
 * mandate, the layer, the row, and the holder type — the same four facts the
 * server's `MandateResolutionError` carries, so the two halves read alike in a
 * bug report.
 */
export function holderNotExecutableMessage(
  mandateKey: string,
  layer: MandateBindingLayer,
  bindingId: string | null,
  holderType: string,
): string {
  const where =
    layer === "organization" ? "an organization binding" : "your binding";
  const which = bindingId ? ` (${bindingId})` : "";
  return (
    `mandate "${mandateKey}": ${where}${which} names a '${holderType}' Holder — ` +
    "this browser path can only launch an agent Holder directly. " +
    "Workflow Holders run on the server; call this mandate through the " +
    // The remedy in the job's own words (V2 round 4 vocabulary sweep): this
    // used to end "…for surfaces that resolve in the browser", which named the
    // old system on a mandate refusal a person reads.
    "server run path, or bind an agent so this job can run in the browser."
  );
}

export interface BindingWave1Fields {
  /**
   * The binding's DECLARED holder type, verbatim (`agent` | `workflow` today;
   * absent/blank reads as `agent`, matching the server's `or "agent"` default).
   * Deliberately NOT collapsed to a two-value union: a value we do not
   * recognize must REFUSE at the resolver, never masquerade as an executable
   * agent Holder — check it against `EXECUTABLE_HOLDER_TYPES`.
   */
  holderType: string;
  /** A workflow Holder's `workflow.definition` id (never a version id). */
  holderId: string | null;
  /** An optional pin to one `workflow.definition_version`. */
  holderVersionId: string | null;
  consumptionMap: ConsumptionMap;
  /**
   * P14 — the binding's stored answer to "run without stopping to ask".
   * `null` is a REAL third answer ("this binding has no opinion; the layer
   * below decides"), never a synonym for false — collapsing the two is exactly
   * the auto-run inversion, in which a binding could never say "run it".
   */
  autoRun: boolean | null;
  /**
   * G6 — stored sources this parse could NOT use, one readable sentence each.
   * Empty on every healthy row. Whoever renders the map must put these on the
   * screen: data was discarded, and only the console knew.
   */
  droppedSources: string[];
}

/** Narrow the wave-1 binding columns off a full `select("*")` row. */
export function parseBindingWave1(row: object | null): BindingWave1Fields {
  if (row == null) {
    return {
      holderType: "agent",
      holderId: null,
      holderVersionId: null,
      consumptionMap: {},
      autoRun: null,
      droppedSources: [],
    };
  }
  const raw: Record<string, unknown> = { ...row };
  const uuidish = (value: unknown): string | null =>
    typeof value === "string" && value.length > 0 ? value : null;
  const parsed = parseConsumptionMapWithDrops(raw.consumption_map);
  return {
    holderType:
      typeof raw.holder_type === "string" && raw.holder_type.length > 0
        ? raw.holder_type
        : "agent",
    holderId: uuidish(raw.holder_id),
    holderVersionId: uuidish(raw.holder_version_id),
    consumptionMap: parsed.map,
    autoRun: typeof raw.auto_run === "boolean" ? raw.auto_run : null,
    droppedSources: parsed.dropped,
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
  for (const [name, sources] of Object.entries(map)) {
    const multi = sources.length > 1;
    const channels = new Set<string>();
    for (const entry of sources) {
      channels.add(sourceChannel(entry));
      // ── The binding's OWN content: a literal, or an answer it will ask for.
      // Neither is looked up in the offer — they are not offered values — but
      // both obey the same two rules every source obeys: a thing with no text
      // form cannot ride a variable, and cannot be joined with other things.
      if (entry.mapType === "direct_value") {
        const structured =
          typeof entry.target === "object" && entry.target !== null;
        if (structured && multi) {
          problems.push(
            `"${name}" has a structured fixed value, which has no text form — it can't be joined with other values; give it an input of its own`,
          );
        } else if (structured && sourceChannel(entry) === "variable") {
          problems.push(
            `"${name}" has a structured fixed value — deliver it as context, never as a blob variable`,
          );
        }
        continue;
      }
      if (entry.mapType === "prompt_user") {
        if (!entry.prompt.trim()) {
          problems.push(
            `"${name}" asks the person for this input but has no question — write what the run form should say`,
          );
        }
        continue;
      }
      const source = entry.target || name;
      const value = offered.get(source);
      if (!value) {
        problems.push(
          `"${name}" consumes "${source}", which this job does not offer`,
        );
        continue;
      }
      if (!value.guaranteed && !entry.when_absent) {
        problems.push(
          `"${name}" takes "${source}", which is optional — choose what happens when it is absent (skip, use a default, or fail)`,
        );
      }
      if (entry.when_absent === "use_default" && entry.default == null) {
        problems.push(
          `"${name}" says "use a default" for "${source}" but no default is set`,
        );
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
      // D18.2 — MANY-TO-ONE IS A TEXT OPERATION. Several values become one
      // input by being joined with a blank line, so every source in a
      // multi-source target must have a text form. A media ref has none (it
      // becomes a turn block) and a structured shape has none either.
      if (multi && MEDIA_VALUE_KINDS.has(value.kind)) {
        problems.push(
          `"${source}" is a file and can't be joined with other values — give it an input of its own`,
        );
      } else if (multi && !SCALAR_VALUE_KINDS.has(value.kind)) {
        problems.push(
          `"${source}" is structured ("${value.kind}") and can't be joined with other values — give it an input of its own`,
        );
      }
    }
    if (channels.size > 1) {
      problems.push(
        `"${name}" has sources going to different places — everything feeding one input lands the same way`,
      );
    }
  }
  return problems;
}
