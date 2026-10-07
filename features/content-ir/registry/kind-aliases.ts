/**
 * Kind aliases — the TS twin of the Python `@kind(aliases=…)`, the ONE alias mechanism.
 *
 * A definition that declares `discriminatorAliases` is ALSO read under each alias slug: the
 * alias gets a derived definition (same facets, `kind` renamed) so a payload that says
 * `{"__kind":"checklist"}` routes, validates and renders exactly as `task_list`. Nothing in a
 * component names an alias; the registry is the only place that knows.
 *
 * `KIND_ALIAS_FIELD_MAPS` carries the field names an alias slug's emitters also use
 * (`done` for `checked`). Mapped-from fields become optional siblings in the alias schema (so
 * a checklist item with `text` and no `title` is not "broken"); the kind's bridge reads them
 * through `canonicalAliasFields`.
 */

import type { CanonicalBlockIR, FieldSchema, KindDefinition, KindSchema } from "@ai-matrx/content-ir";

/** alias slug → { emitted field → canonical field }. */
export const KIND_ALIAS_FIELD_MAPS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  checklist_item: { done: "checked", completed: "checked", text: "title", label: "title", name: "title" },
};

/** One level of an item with the alias's emitted field names read as the canonical ones. */
export function canonicalAliasFields(
  item: Record<string, unknown>,
  aliasKind: string,
): Record<string, unknown> {
  const map = KIND_ALIAS_FIELD_MAPS[aliasKind];
  if (!map) return item;
  const out: Record<string, unknown> = { ...item };
  for (const [from, to] of Object.entries(map)) {
    if (out[to] === undefined && out[from] !== undefined) out[to] = out[from];
    delete out[from];
  }
  return out;
}

/**
 * Declared aliases that are NOT derived here: the slug is already its own registered kind with
 * its own component (`platform_record` is `data.read_record`'s shape, drawn by
 * `PlatformRecordBlock`; deriving it as a `relation` would take that component away).
 */
const HELD_ALIASES: ReadonlySet<string> = new Set(["platform_record"]);

function aliasMapOf(defs: readonly KindDefinition[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const def of defs) {
    const derived = def.discriminatorAliases?.filter((a) => !HELD_ALIASES.has(a));
    if (derived?.length) out.set(def.kind, derived);
  }
  return out;
}

function widenField(field: FieldSchema, aliases: Map<string, string[]>): FieldSchema {
  if (field.type === "array") {
    const kinds = field.itemKinds.flatMap((k) => [k, ...(aliases.get(k) ?? [])]);
    return { ...field, itemKinds: [...new Set(kinds)] };
  }
  if (field.type === "object" && aliases.has(field.kind)) return field;
  if (field.type === "inline_object") {
    return {
      ...field,
      fields: Object.fromEntries(
        Object.entries(field.fields).map(([k, f]) => [k, widenField(f, aliases)]),
      ),
    };
  }
  return field;
}

function aliasSchema(
  schema: KindSchema,
  alias: string,
  aliases: Map<string, string[]>,
): KindSchema {
  const fields: Record<string, FieldSchema> = Object.fromEntries(
    Object.entries(schema.fields).map(([k, f]) => [k, widenField(f, aliases)]),
  );
  const map = KIND_ALIAS_FIELD_MAPS[alias];
  if (map) {
    for (const [from, to] of Object.entries(map)) {
      const target = fields[to];
      if (!target || fields[from]) continue;
      fields[from] = { type: target.type === "boolean" ? "boolean" : "string" } as FieldSchema;
      if ("required" in target && target.required) fields[to] = { ...target, required: false } as FieldSchema;
    }
  }
  return { ...schema, kind: alias, fields };
}

/** Re-root an envelope under the canonical kind so the canonical bridge accepts it. */
const REROOTED = new WeakMap<CanonicalBlockIR, Map<string, CanonicalBlockIR>>();
function reroot(envelope: CanonicalBlockIR, kind: string): CanonicalBlockIR {
  let byKind = REROOTED.get(envelope);
  if (!byKind) REROOTED.set(envelope, (byKind = new Map()));
  let out = byKind.get(kind);
  if (!out) byKind.set(kind, (out = { ...envelope, root: { ...envelope.root, kind } }));
  return out;
}

/**
 * Every definition plus a derived one per declared alias. Primary definitions also widen their
 * `itemKinds` to admit an aliased child kind (`task_list.items` accepts `checklist_item`).
 */
export function expandKindAliases(defs: readonly KindDefinition[]): KindDefinition[] {
  const aliases = aliasMapOf(defs);
  if (aliases.size === 0) return [...defs];
  const out: KindDefinition[] = [];
  for (const def of defs) {
    const primary: KindDefinition = def.schema
      ? { ...def, schema: aliasSchema(def.schema, def.kind, aliases) }
      : def;
    out.push(primary);
    for (const alias of aliases.get(def.kind) ?? []) {
      const { discriminatorAliases: _own, toLegacyServerData, ...rest } = primary;
      out.push({
        ...rest,
        kind: alias,
        ...(primary.schema ? { schema: aliasSchema(def.schema!, alias, aliases) } : null),
        ...(toLegacyServerData
          ? { toLegacyServerData: (env: CanonicalBlockIR) => toLegacyServerData(reroot(env, def.kind)) }
          : null),
      });
    }
  }
  return out;
}
