/**
 * The Spaces agents' answers → their compiled components (+ compiled definitions).
 *
 * | Kind | Mandate | Component |
 * |---|---|---|
 * | `space_build_result` | `spaces.build` | SpaceBuildResultBlock — summary + Open the Space + its tables |
 * | `space_database_design` | `spaces.design_database` | SpaceDatabaseDesignBlock — the database's name, properties, views, sample rows |
 * | `space_notion_import` | `spaces.move_in` | SpaceNotionImportBlock — the page's title, its databases, what could not move |
 *
 * Before these kinds (2026-10-07) the three agents answered plain JSON with `"__kind": null`
 * and then `"__kind": "json"` — both broken instances, so every run window showed
 * "View 2 problems". Declared in aidream `aidream/kinds/spaces.py`.
 *
 * Complete-only bridges: Spaces itself acts on the finished answer (opens the Space, creates
 * the table, builds the page); a half-streamed design is not worth drawing. The Spaces
 * readers (`features/spaces/ai/*`, `data/designed-database.ts`) read the same value and
 * ignore `__kind`.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";

import { joinBlocks } from "./kind-markdown-utils";
import { isRecord, makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";

export const SPACE_BUILD_RESULT_KIND = "space_build_result";
export const SPACE_DATABASE_DESIGN_KIND = "space_database_design";
export const SPACE_NOTION_IMPORT_KIND = "space_notion_import";

// ── Readers (read once, here) ────────────────────────────────────────────────

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()) : [];
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export interface SpacesPropertySummary {
  key: string;
  name: string;
  type: string;
  options: { name: string; color: string }[];
}

export interface SpacesDatabaseSummary {
  name: string;
  titleProperty: string;
  properties: SpacesPropertySummary[];
  /** Rows as `{propertyKey: value}`, in the answer's order. */
  rows: Record<string, string>[];
}

function readProperties(value: unknown): SpacesPropertySummary[] {
  return records(value).flatMap((p) =>
    typeof p.key === "string"
      ? [{
          key: p.key,
          name: text(p.name) || p.key,
          type: text(p.type) || "text",
          options: records(p.options).map((o) => ({ name: text(o.name), color: text(o.color) })).filter((o) => o.name),
        }]
      : [],
  );
}

function readRows(value: unknown): Record<string, string>[] {
  return records(value).map((row) => {
    const out: Record<string, string> = {};
    for (const cell of records(row.cells)) {
      if (typeof cell.property === "string") out[cell.property] = text(cell.value);
    }
    return out;
  });
}

function readDatabase(value: Record<string, unknown>): SpacesDatabaseSummary {
  return {
    name: text(value.name),
    titleProperty: text(value.title_property),
    properties: readProperties(value.properties),
    rows: readRows(value.rows),
  };
}

export interface SpaceBuildResultData extends Record<string, unknown> {
  summary: string;
  rootSpaceId: string | null;
  spaceIds: string[];
  tableIds: string[];
}

export function readSpaceBuildResult(value: Record<string, unknown>): SpaceBuildResultData {
  const root = text(value.root_space_id);
  return {
    summary: text(value.summary),
    rootSpaceId: root || null,
    spaceIds: strings(value.space_ids),
    tableIds: strings(value.table_ids),
  };
}

export interface SpaceDatabaseDesignData extends SpacesDatabaseSummary, Record<string, unknown> {
  views: { name: string; layout: string; groupBy: string | null }[];
  summary: string;
}

export function readSpaceDatabaseDesign(value: Record<string, unknown>): SpaceDatabaseDesignData {
  return {
    ...readDatabase(value),
    views: records(value.views).map((v) => ({
      name: text(v.name),
      layout: text(v.layout) || "table",
      groupBy: typeof v.group_by === "string" && v.group_by ? v.group_by : null,
    })),
    summary: text(value.summary),
  };
}

export interface SpaceNotionImportData extends Record<string, unknown> {
  title: string;
  icon: string;
  /** The page body with `[[database:N]]` lines left out. */
  markdown: string;
  databases: SpacesDatabaseSummary[];
  notes: string[];
}

const DB_LINE = /^\s*\[\[database:\d+\]\]\s*$/;

export function readSpaceNotionImport(value: Record<string, unknown>): SpaceNotionImportData {
  return {
    title: text(value.title).trim(),
    icon: text(value.icon).trim(),
    markdown: text(value.markdown)
      .split("\n")
      .filter((line) => !DB_LINE.test(line))
      .join("\n")
      .trim(),
    databases: records(value.databases).map(readDatabase),
    notes: strings(value.notes),
  };
}

// ── Schemas (the registry row is the authority; these mirror it) ─────────────

const propertiesField = { type: "json[]", required: true, description: "Properties: {key, name, type, options [{name, color}]}." } as const;
const rowsField = { type: "json[]", required: true, description: "Rows: {cells [{property, value}]}." } as const;

export const spaceBuildResultKindSchema: KindSchema = {
  kind: SPACE_BUILD_RESULT_KIND,
  fields: {
    summary: { type: "string", required: true, description: "Two plain sentences: what was built or changed." },
    root_space_id: { type: "string", required: true, description: "The root Space built, or the Space changed." },
    space_ids: { type: "string[]", required: true, description: "Every Space id created or changed." },
    table_ids: { type: "string[]", required: true, description: "Every table id created or changed." },
  },
};

export const spaceDatabaseDesignKindSchema: KindSchema = {
  kind: SPACE_DATABASE_DESIGN_KIND,
  fields: {
    name: { type: "string", required: true, description: "The database's short name." },
    title_property: { type: "string", required: true, description: "The key of the title property." },
    properties: propertiesField,
    views: { type: "json[]", required: true, description: "Views: {name, layout, group_by, chart}." },
    rows: rowsField,
    summary: { type: "string", required: true, description: "One sentence on what was designed." },
  },
};

export const spaceNotionImportKindSchema: KindSchema = {
  kind: SPACE_NOTION_IMPORT_KIND,
  fields: {
    title: { type: "string", required: true, description: "The page title." },
    icon: { type: "string", required: true, description: "A Lucide icon name in PascalCase." },
    markdown: { type: "string", required: true, description: "The page body, [[database:N]] where database N sits." },
    databases: { type: "json[]", required: true, description: "Databases: {name, title_property, properties, rows}." },
    notes: { type: "string[]", required: true, description: "What could not be carried over." },
  },
};

// ── Bridges ──────────────────────────────────────────────────────────────────

export const spaceBuildResultServerDataFromEnvelope = makeCompleteEnvelopeBridge<SpaceBuildResultData>(
  SPACE_BUILD_RESULT_KIND,
  (value) => {
    const data = readSpaceBuildResult(value);
    return data.summary || data.rootSpaceId ? data : undefined;
  },
);

export const spaceDatabaseDesignServerDataFromEnvelope = makeCompleteEnvelopeBridge<SpaceDatabaseDesignData>(
  SPACE_DATABASE_DESIGN_KIND,
  (value) => {
    const data = readSpaceDatabaseDesign(value);
    return data.name || data.properties.length ? data : undefined;
  },
);

export const spaceNotionImportServerDataFromEnvelope = makeCompleteEnvelopeBridge<SpaceNotionImportData>(
  SPACE_NOTION_IMPORT_KIND,
  (value) => {
    const data = readSpaceNotionImport(value);
    return data.title || data.markdown || data.databases.length ? data : undefined;
  },
);

// ── Markdown (copy / export) ─────────────────────────────────────────────────

function databaseMarkdown(db: SpacesDatabaseSummary, level: string): string {
  return joinBlocks([
    `${level} ${db.name || "Database"}`,
    db.properties.length ? db.properties.map((p) => `- ${p.name} (${p.type.replace("_", " ")})`).join("\n") : null,
    db.rows.length ? `${db.rows.length} ${db.rows.length === 1 ? "row" : "rows"}` : null,
  ]);
}

export function spaceBuildResultMarkdownFromValue(value: Record<string, unknown>): string {
  const data = readSpaceBuildResult(value);
  return joinBlocks([
    data.summary || null,
    data.rootSpaceId ? `[Open the Space](/spaces/${data.rootSpaceId})` : null,
  ]);
}

export function spaceDatabaseDesignMarkdownFromValue(value: Record<string, unknown>): string {
  const data = readSpaceDatabaseDesign(value);
  return joinBlocks([databaseMarkdown(data, "#"), data.summary || null]);
}

export function spaceNotionImportMarkdownFromValue(value: Record<string, unknown>): string {
  const data = readSpaceNotionImport(value);
  return joinBlocks([
    `# ${data.title || "Imported page"}`,
    data.markdown || null,
    ...data.databases.map((db) => databaseMarkdown(db, "##")),
    data.notes.length ? `## Not carried over\n\n${data.notes.map((n) => `- ${n}`).join("\n")}` : null,
  ]);
}

export const SPACES_RESULT_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: SPACE_BUILD_RESULT_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: SPACE_BUILD_RESULT_KIND,
    toLegacyServerData: spaceBuildResultServerDataFromEnvelope,
    toMarkdown: spaceBuildResultMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: spaceBuildResultKindSchema,
  },
  {
    kind: SPACE_DATABASE_DESIGN_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: SPACE_DATABASE_DESIGN_KIND,
    toLegacyServerData: spaceDatabaseDesignServerDataFromEnvelope,
    toMarkdown: spaceDatabaseDesignMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: spaceDatabaseDesignKindSchema,
  },
  {
    kind: SPACE_NOTION_IMPORT_KIND,
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: SPACE_NOTION_IMPORT_KIND,
    toLegacyServerData: spaceNotionImportServerDataFromEnvelope,
    toMarkdown: spaceNotionImportMarkdownFromValue,
    persistence: { persistStructured: true },
    schema: spaceNotionImportKindSchema,
  },
];
