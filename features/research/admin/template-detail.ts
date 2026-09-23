/**
 * The research TEMPLATE'S own `/detail/research_template/<id>` page — the
 * Detail primitive's `refineDetail` seam for this one type, following the
 * same pattern `features/crm/party-detail.ts` set for `crm.party`.
 *
 * WHY THIS FILE EXISTS. `research_template` carried no refinement, so it got
 * the generic composition: `fieldsFromRow` walks every populated column of
 * `research.rs_template` and, for anything that is not a string/number/
 * boolean, `JSON.stringify`s it into a monospace block (`lib/detail/format.ts`
 * `formatValue`). On a template that means FIVE raw-JSON boxes on screen —
 * keyword templates, default tags, default search params, agent config,
 * metadata — headed by labels like "AGENT CONFIG" over
 * `{"updater_agent_id":"6e8c33ce-…"}`. The try-everything guide (2026-09-23,
 * step 21) is right that this reads as code, not settings: an agent id in a
 * bracketed string teaches a non-technical admin nothing, and the platform
 * already has a form primitive for "this value names another record" — the
 * `DetailField.ref` door every other field type renders through `RefCell`.
 *
 * WHAT THIS DOES. A CLOSED, ordered, human-labelled field list: short scalars
 * as themselves, list-shaped settings (keyword templates, default tags) joined
 * into one line of English instead of a `[`-fenced array, `default_search_params`
 * and `metadata` unpacked into one labelled field per key instead of a JSON
 * block, and every configured agent role in `agent_config` rendered as a real
 * door to that agent record — the exact meaning `AGENT_CONFIG_META` already
 * carries for the template editor's own agent-wiring panel
 * (`features/research/admin/types.ts`), reused here rather than re-invented.
 *
 * The header's title already read the template's `name` correctly before this
 * file existed (`detailSource.titleField: "name"` in `registry.tsx`) — the
 * long id the guide saw is the record-meta line every Detail page shows under
 * every record's name, not a stand-in title; nothing here needed to change to
 * fix that reading, and this file does not touch `title`.
 */

import type { DetailField, DetailRow, DetailRecordType } from "@/lib/detail/types";
import { formatWhen } from "@/lib/detail/format";
import { hasAnyDoor } from "@/components/official/entity-ref/doors";
import type { Json } from "@/types/database.types";

import { AGENT_CONFIG_KEYS, AGENT_CONFIG_META, type AgentConfigKey } from "./types";

const AUTONOMY_WORDS: Record<string, string> = {
  auto: "Automatic",
  semi: "Semi-automatic",
  manual: "Manual",
};

function text(row: DetailRow, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t || null;
}

/** A jsonb array of strings, joined into one line — never a bracketed dump. */
function stringListOf(value: Json | unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** A flat jsonb object's own keys, each becoming one labelled field. */
function plainObjectEntries(value: unknown): Array<[string, Json]> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, Json>);
}

function titleizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bid\b/gi, "ID")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** One value from `default_search_params`/`metadata`, as a short line of text. */
function shortValueText(value: Json): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const strings = stringListOf(value);
    return strings.length ? strings.join(", ") : null;
  }
  // A nested object under a settings key is rare on this table; when it
  // happens the whole point still holds — one labelled field, not a second
  // JSON block — so it is stringified compactly rather than pretty-printed.
  try {
    const compact = JSON.stringify(value);
    return compact && compact !== "{}" ? compact : null;
  } catch {
    return null;
  }
}

/** Every key of a flat jsonb settings object as its own labelled field. */
function fieldsFromPlainObject(
  keyPrefix: string,
  value: unknown,
): DetailField[] {
  return plainObjectEntries(value).flatMap(([key, raw]) => {
    const shown = shortValueText(raw);
    if (!shown) return [];
    return [{ key: `${keyPrefix}:${key}`, label: titleizeKey(key), text: shown }];
  });
}

/** Every configured agent role, as a real door to that agent — never a raw uuid in a JSON block. */
function agentConfigFields(agentConfig: unknown): DetailField[] {
  if (agentConfig === null || typeof agentConfig !== "object" || Array.isArray(agentConfig)) {
    return [];
  }
  const config = agentConfig as Record<string, Json>;
  const canOpenAgent = hasAnyDoor("agent");
  return AGENT_CONFIG_KEYS.flatMap((key: AgentConfigKey) => {
    const value = config[key];
    if (typeof value !== "string" || !value.trim()) return [];
    const meta = AGENT_CONFIG_META[key];
    const field: DetailField = canOpenAgent
      ? { key, label: meta.label, text: value, ref: { token: "agent", id: value } }
      : { key, label: meta.label, text: value };
    return [field];
  });
}

/**
 * THE research template field list. Ordered, human-labelled, closed — the
 * settings a template actually carries, never every populated column dumped
 * in PostgREST's key order.
 */
export function researchTemplateDetailFields(row: DetailRow): DetailField[] {
  const fields: DetailField[] = [];
  const push = (key: string, label: string, value: string | null): void => {
    if (value) fields.push({ key, label, text: value });
  };

  push("name", "Name", text(row, "name"));
  push("description", "Description", text(row, "description"));
  push("is_system", "Kind", row.is_system === true ? "Built into the platform" : "Custom");
  const autonomy = text(row, "autonomy_level");
  push("autonomy_level", "Autonomy", autonomy ? (AUTONOMY_WORDS[autonomy] ?? autonomy) : null);

  const keywordTemplates = stringListOf(row.keyword_templates);
  if (keywordTemplates.length) {
    fields.push({
      key: "keyword_templates",
      label: `Keyword templates (${keywordTemplates.length})`,
      text: keywordTemplates.join(", "),
    });
  }

  const defaultTags = stringListOf(row.default_tags);
  if (defaultTags.length) {
    fields.push({
      key: "default_tags",
      label: `Default tags (${defaultTags.length})`,
      text: defaultTags.join(", "),
    });
  }

  fields.push(...fieldsFromPlainObject("default_search_params", row.default_search_params));
  fields.push(...agentConfigFields(row.agent_config));
  fields.push(...fieldsFromPlainObject("metadata", row.metadata));

  if (typeof row.version === "number") {
    push("version", "Version", String(row.version));
  }
  push("visibility", "Who can see this", text(row, "visibility"));
  push(
    "created_at",
    "Created",
    typeof row.created_at === "string" ? formatWhen(row.created_at) : null,
  );
  push(
    "updated_at",
    "Last updated",
    typeof row.updated_at === "string" ? formatWhen(row.updated_at) : null,
  );

  return fields;
}

/**
 * The research-template registration's ONE refinement — everything else
 * (the loader, the title, the health producer, the icon, the accent) is the
 * base composition, untouched.
 */
export function refineResearchTemplateDetail(base: DetailRecordType): DetailRecordType {
  return {
    ...base,
    fields: (row) => researchTemplateDetailFields(row),
  };
}
