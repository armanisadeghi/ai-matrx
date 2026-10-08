// lib/spaces-blocks/jsonSchema.ts — the stored Space snapshot as a JSON Schema (draft 2020-12).
//
// GENERATED FROM THE CATALOG: `BLOCK_SPECS` (schema.ts) supplies the type list, what `text` means and
// which children each type may hold; `PROPS_SCHEMAS` below holds each type's props shape, keyed by the
// same type strings (a test fails if the two key sets differ). The result is stored in the database as
// `content.space_snapshot_schema()` and enforced on every insert into `content.space_payload`.
//
// Not expressible in JSON Schema, so enforced only by `validateSnapshot` in the editor/importers:
// block ids unique across the tree.
//
// Regenerate the SQL function: `pnpm exec tsx scripts/spaces-snapshot-schema.mjs --print-sql`.

import { BLOCK_SPECS } from "./schema";
import { BUTTON_ACTION_KINDS, DATABASE_CHART_OPS, DATABASE_CHART_TYPES, DATABASE_OPEN_AS, DATABASE_VIEW_LAYOUTS, SPACE_COLORS } from "./types";

type J = Record<string, unknown>;

const nonEmptyStr: J = { type: "string", minLength: 1 };
const bool: J = { type: "boolean" };
const nullableStr: J = { type: ["string", "null"] };
const ref = (n: string): J => ({ $ref: `#/$defs/${n}` });
const spans = ref("spans");
const alignment: J = { textAlignment: { enum: ["left", "center", "right", "justify"] } };

/** props schema + whether props must be present, per stored block type. */
const PROPS_SCHEMAS: Record<string, { required?: boolean; schema: J }> = {
  text: {
    schema: {
      properties: {
        ...alignment,
        // an importer's "could not map this" marker; round-trips through the editor
        unsupported: {
          type: "object",
          required: ["from", "kind", "source"],
          properties: { from: { type: "string" }, kind: { type: "string" }, source: { type: "string" } },
        },
      },
    },
  },
  heading: {
    required: true,
    schema: {
      required: ["level"],
      properties: { level: { type: "number", enum: [1, 2, 3, 4] }, toggleable: bool, ...alignment },
    },
  },
  bulleted: { schema: { properties: alignment } },
  numbered: { schema: { properties: alignment } },
  todo: { required: true, schema: { required: ["checked"], properties: { checked: bool } } },
  toggle: { schema: { properties: alignment } },
  quote: { schema: { properties: alignment } },
  callout: { schema: { properties: { icon: { type: "string" } } } },
  divider: { schema: {} },
  code: { schema: { properties: { language: { type: "string" }, caption: spans } } },
  equation: { required: true, schema: { required: ["expression"], properties: { expression: { type: "string" } } } },
  page: { required: true, schema: { required: ["spaceId"], properties: { spaceId: nonEmptyStr } } },
  linkToPage: { required: true, schema: { required: ["spaceId"], properties: { spaceId: nonEmptyStr } } },
  table: {
    required: true,
    schema: {
      required: ["headerRow", "headerColumn", "rows"],
      properties: {
        headerRow: bool,
        headerColumn: bool,
        columnWidths: { type: "array", items: { oneOf: [{ type: "null" }, { type: "number", exclusiveMinimum: 0 }] } },
        rows: {
          type: "array",
          minItems: 1,
          items: { type: "object", required: ["cells"], properties: { cells: { type: "array", items: spans } } },
        },
      },
    },
  },
  tableOfContents: { schema: {} },
  breadcrumb: { schema: {} },
  columnList: { schema: {} },
  column: {
    required: true,
    schema: { required: ["width"], properties: { width: { type: "number", exclusiveMinimum: 0 } } },
  },
  image: { required: true, schema: mediaProps() },
  video: { required: true, schema: mediaProps() },
  audio: { required: true, schema: mediaProps() },
  file: { required: true, schema: mediaProps() },
  pdf: { required: true, schema: mediaProps() },
  bookmark: { required: true, schema: { required: ["url"], properties: { url: nonEmptyStr, caption: spans } } },
  embed: { required: true, schema: { required: ["url"], properties: { url: nonEmptyStr, caption: spans } } },
  database: {
    required: true,
    schema: {
      required: ["inline", "source"],
      properties: {
        inline: bool,
        title: { type: "string" },
        sample: { type: "string" },
        linked: bool,
        showTitle: bool,
        openAs: { enum: [...DATABASE_OPEN_AS] },
        activeViewId: { type: "string" },
        views: { type: "array", items: databaseView() },
        source: {
          oneOf: [
            {
              type: "object",
              required: ["kind", "tableId"],
              properties: { kind: { const: "table" }, tableId: nonEmptyStr, viewId: nonEmptyStr },
            },
            { type: "object", required: ["kind", "token"], properties: { kind: { const: "entity" }, token: nonEmptyStr } },
          ],
        },
      },
    },
  },
  tabs: { schema: { properties: { activeTab: { type: "string" } } } },
  tab: { schema: {} },
  synced: { required: true, schema: { required: ["sourceId"], properties: { sourceId: nonEmptyStr } } },
  button: {
    required: true,
    schema: {
      required: ["label", "actions"],
      properties: {
        label: { type: "string" },
        icon: { type: "string" },
        actions: { type: "array", items: { type: "object", required: ["kind"], properties: { kind: { enum: [...BUTTON_ACTION_KINDS] } } } },
      },
    },
  },
  slot: { required: true, schema: { required: ["label"], properties: { label: { type: "string" } } } },
};

function databaseView(): J {
  return {
    type: "object",
    required: ["id", "name", "layout"],
    properties: {
      id: nonEmptyStr,
      name: { type: "string" },
      layout: { enum: [...DATABASE_VIEW_LAYOUTS] },
      icon: { type: "string" },
      groupField: nullableStr,
      dateField: nullableStr,
      sorts: {
        type: "array",
        items: { type: "object", required: ["field", "direction"], properties: { field: { type: "string" }, direction: { enum: ["asc", "desc"] } } },
      },
      filters: { type: "object" },
      hiddenFields: { type: "array", items: { type: "string" } },
      chart: {
        type: "object",
        required: ["type", "groupBy", "op"],
        properties: {
          type: { enum: [...DATABASE_CHART_TYPES] },
          groupBy: nullableStr,
          op: { enum: [...DATABASE_CHART_OPS] },
          field: nullableStr,
          sort: { enum: ["manual", "asc", "desc"] },
          legend: bool,
          dataLabels: bool,
          centerValue: bool,
        },
      },
    },
  };
}

function mediaProps(): J {
  return {
    properties: { width: { type: "number" }, name: { type: "string" }, caption: spans },
    // exactly one of fileId / url, each a non-empty string
    oneOf: [
      { required: ["fileId"], properties: { fileId: nonEmptyStr } },
      { required: ["url"], properties: { url: nonEmptyStr } },
    ],
  };
}

function mediaDef(allowOffset: boolean): J {
  return {
    type: "object",
    oneOf: ["fileId", "url", "icon"].map((k) => ({ required: [k], properties: { [k]: nonEmptyStr } })),
    ...(allowOffset ? { properties: { offsetY: { type: "number" } } } : {}),
  };
}

function blockRule(type: string): J {
  const spec = BLOCK_SPECS.get(type)!;
  const p = PROPS_SCHEMAS[type];
  const then: J = {
    properties: {
      props: { type: "object", ...p.schema },
      text: spec.text === "inline" ? spans : { type: "array", maxItems: 0 },
      children:
        spec.children === "none"
          ? { type: "array", maxItems: 0 }
          : spec.children === "column"
            ? { type: "array", minItems: 2, items: { type: "object", required: ["type"], properties: { type: { const: "column" } } } }
            : spec.children === "tab"
              ? { type: "array", items: { type: "object", required: ["type"], properties: { type: { const: "tab" } } } }
              : spec.children === "blocks"
                ? { type: "array", items: { not: { type: "object", required: ["type"], properties: { type: { enum: ["column", "tab"] } } } } }
                : { type: "array", items: { not: { type: "object", required: ["type"], properties: { type: { const: "tab" } } } } },
    },
    ...(p.required || spec.children === "column" ? { required: [...(p.required ? ["props"] : []), ...(spec.children === "column" ? ["children"] : [])] } : {}),
  };
  return { if: { required: ["type"], properties: { type: { const: type } } }, then };
}

export function buildSpaceSnapshotSchema(): J {
  const types = [...BLOCK_SPECS.keys()];
  const missing = types.filter((t) => !PROPS_SCHEMAS[t]);
  const extra = Object.keys(PROPS_SCHEMAS).filter((t) => !BLOCK_SPECS.has(t));
  if (missing.length || extra.length) throw new Error(`jsonSchema.ts out of step with the catalog: missing [${missing}] extra [${extra}]`);
  const color: J = { enum: [...SPACE_COLORS] };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Space snapshot",
    type: "object",
    required: ["v", "settings", "blocks"],
    properties: {
      v: { const: 1 },
      settings: {
        type: "object",
        required: ["font", "smallText", "fullWidth", "locked"],
        properties: { font: { enum: ["default", "serif", "mono"] }, smallText: bool, fullWidth: bool, locked: bool },
      },
      icon: { oneOf: [{ type: "null" }, mediaDef(false)] },
      cover: { oneOf: [{ type: "null" }, mediaDef(true)] },
      // a tab sits only inside tabs
      blocks: { type: "array", items: { allOf: [ref("block"), { not: { type: "object", required: ["type"], properties: { type: { const: "tab" } } } }] } },
    },
    $defs: {
      color,
      spans: { type: "array", items: ref("span") },
      span: {
        type: "object",
        required: ["text"],
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          bold: bool,
          italic: bool,
          underline: bool,
          strike: bool,
          code: bool,
          color: ref("color"),
          background: ref("color"),
          link: nonEmptyStr,
          equation: { type: "string" },
          suggestion: {
            type: "object",
            required: ["id", "kind", "by", "at"],
            properties: { id: nonEmptyStr, kind: { enum: ["insert", "delete"] }, by: nonEmptyStr, at: nonEmptyStr },
          },
          mention: {
            oneOf: [
              { type: "object", required: ["kind", "spaceId"], properties: { kind: { const: "space" }, spaceId: nonEmptyStr } },
              { type: "object", required: ["kind", "userId"], properties: { kind: { const: "person" }, userId: nonEmptyStr } },
              { type: "object", required: ["kind", "iso"], properties: { kind: { const: "date" }, iso: nonEmptyStr } },
              { type: "object", required: ["kind", "url"], properties: { kind: { const: "link" }, url: nonEmptyStr, title: { type: "string" }, icon: { type: "string" } } },
            ],
          },
        },
      },
      block: {
        type: "object",
        required: ["id", "type"],
        properties: {
          id: nonEmptyStr,
          type: { enum: types },
          color: ref("color"),
          background: ref("color"),
          props: { type: "object" },
          text: { type: "array" },
          children: { type: "array", items: ref("block") },
        },
        allOf: types.map(blockRule),
      },
    },
  };
}

/** The SQL that (re)creates content.space_snapshot_schema(). Dollar-quote tag cannot appear in the JSON. */
export function spaceSnapshotSchemaSql(schema: J = buildSpaceSnapshotSchema()): string {
  const json = JSON.stringify(schema);
  if (json.includes("$schema_json$")) throw new Error("schema contains the dollar-quote tag");
  return `create or replace function content.space_snapshot_schema()
returns jsonb language sql immutable parallel safe set search_path to 'pg_catalog'
as $fn$select $schema_json$${json}$schema_json$::jsonb$fn$;`;
}
