"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { FieldSchema, KindSchema } from "./kind-schemas";
import { KIND_KEY } from "./kind-schemas";
import type { LiveBlockSnapshot } from "./demo-block-components";
import { formatBlockLabel, schemaLayoutMode } from "./schema-structure";
import { pathLabel } from "./validation-report";

/**
 * Exact props passed to every live block renderer in the json-block-detector demo.
 *
 * Custom components (e.g. FlashcardsBlock) receive derived slices of this data;
 * the generic fallback reads `snapshot.value` directly.
 */
export type GenericBlockRenderProps = {
  schema: KindSchema;
  snapshot: LiveBlockSnapshot;
  allSchemas: Record<string, KindSchema>;
};

/**
 * Shape of `snapshot.value` — the parser's latest `block_snapshot` for this path.
 * Always includes `__kind`; other keys match the kind's field schema (+ extras).
 */
export type BlockSnapshotData = Record<string, unknown> & {
  [KIND_KEY]: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 120)}…` : value || '""';
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.length} item${value.length === 1 ? "" : "s"}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).length} key${Object.keys(value).length === 1 ? "" : "s"}}`;
  }
  return String(value);
}

function isScalarField(field: FieldSchema): boolean {
  return (
    field.type === "string" ||
    field.type === "number" ||
    field.type === "boolean" ||
    field.type === "enum" ||
    field.type === "union" ||
    field.type === "string[]" ||
    field.type === "number[]" ||
    field.type === "boolean[]" ||
    field.type === "record"
  );
}

function BlockStatusBadge({ complete }: { complete: boolean }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase",
        complete ? "bg-success/15 text-success" : "bg-warning/15 text-warning",
      )}
    >
      {complete ? "complete" : "streaming"}
    </span>
  );
}

function FieldRow({
  name,
  value,
  fieldSchema,
}: {
  name: string;
  value: unknown;
  fieldSchema?: FieldSchema;
}) {
  return (
    <div className="flex gap-2 text-[11px]">
      <dt className="shrink-0 font-medium text-muted-foreground">
        {formatBlockLabel(name)}
        {fieldSchema?.required ? "*" : ""}:
      </dt>
      <dd className="min-w-0 break-words text-foreground">
        {formatValue(value)}
      </dd>
    </div>
  );
}

function resolveItemSchema(
  field: FieldSchema & { type: "array" },
  allSchemas: Record<string, KindSchema>,
): KindSchema | null {
  const slug = field.itemKinds[0];
  return slug ? (allSchemas[slug] ?? null) : null;
}

function ItemCard({
  item,
  itemSchema,
  allSchemas,
  index,
  nested = false,
}: {
  item: Record<string, unknown>;
  itemSchema: KindSchema | null;
  allSchemas: Record<string, KindSchema>;
  index: number;
  nested?: boolean;
}) {
  const scalarEntries: Array<[string, unknown]> = [];
  const structuredEntries: Array<{
    name: string;
    field: FieldSchema;
    value: unknown;
  }> = [];

  const fields = itemSchema?.fields ?? {};
  for (const [name, value] of Object.entries(item)) {
    if (name === KIND_KEY) continue;
    const fieldSchema = fields[name];
    if (fieldSchema && !isScalarField(fieldSchema)) {
      structuredEntries.push({ name, field: fieldSchema, value });
    } else {
      scalarEntries.push([name, value]);
    }
  }

  const titleEntry =
    scalarEntries.find(([name]) => name === "title" || name === "name") ??
    scalarEntries.find(([name]) => name === "front" || name === "label");
  const title =
    titleEntry && typeof titleEntry[1] === "string"
      ? titleEntry[1]
      : `Item ${index + 1}`;

  if (!nested || structuredEntries.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-2 shadow-sm">
        <div className="mb-1.5 truncate text-[11px] font-semibold text-foreground">
          {title}
        </div>
        <dl className="space-y-1">
          {scalarEntries.map(([name, value]) => (
            <FieldRow
              key={name}
              name={name}
              value={value}
              fieldSchema={fields[name]}
            />
          ))}
          {structuredEntries.map(({ name, value }) => (
            <FieldRow key={name} name={name} value={value} />
          ))}
        </dl>
      </div>
    );
  }

  return (
    <ExpandableItemCard
      title={title}
      scalarEntries={scalarEntries}
      structuredEntries={structuredEntries}
      fields={fields}
      allSchemas={allSchemas}
    />
  );
}

function ExpandableItemCard({
  title,
  scalarEntries,
  structuredEntries,
  fields,
  allSchemas,
}: {
  title: string;
  scalarEntries: Array<[string, unknown]>;
  structuredEntries: Array<{
    name: string;
    field: FieldSchema;
    value: unknown;
  }>;
  fields: Record<string, FieldSchema>;
  allSchemas: Record<string, KindSchema>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-md border border-border bg-card shadow-sm"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-muted/30">
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
          {title}
        </span>
        <span className="text-[9px] text-muted-foreground">
          {structuredEntries.length} nested
        </span>
      </CollapsibleTrigger>
      <div className="border-t border-border/60 px-2 py-1.5">
        <dl className="space-y-1">
          {scalarEntries.map(([name, value]) => (
            <FieldRow
              key={name}
              name={name}
              value={value}
              fieldSchema={fields[name]}
            />
          ))}
        </dl>
      </div>
      <CollapsibleContent className="border-t border-border/60 px-2 py-2 data-[state=closed]:hidden">
        {structuredEntries.map(({ name, field, value }) => (
          <NestedFieldSection
            key={name}
            name={name}
            field={field}
            value={value}
            allSchemas={allSchemas}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function NestedFieldSection({
  name,
  field,
  value,
  allSchemas,
}: {
  name: string;
  field: FieldSchema;
  value: unknown;
  allSchemas: Record<string, KindSchema>;
}) {
  if (field.type === "array" && Array.isArray(value)) {
    const itemSchema = resolveItemSchema(field, allSchemas);
    return (
      <div className="mb-2 last:mb-0">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {formatBlockLabel(name)} ({value.length})
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {value.map((item, index) =>
            isRecord(item) ? (
              <ItemCard
                key={index}
                item={item}
                itemSchema={itemSchema}
                allSchemas={allSchemas}
                index={index}
              />
            ) : (
              <div
                key={index}
                className="rounded border border-dashed border-border px-2 py-1 text-[10px] text-muted-foreground"
              >
                {formatValue(item)}
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (field.type === "inline_object" && isRecord(value)) {
    return (
      <div className="mb-2 rounded border border-border/60 bg-muted/20 p-2 last:mb-0">
        <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
          {formatBlockLabel(name)}
        </div>
        <dl className="space-y-1">
          {Object.entries(value).map(([key, val]) => (
            <FieldRow
              key={key}
              name={key}
              value={val}
              fieldSchema={field.fields[key]}
            />
          ))}
        </dl>
      </div>
    );
  }

  return <FieldRow name={name} value={value} fieldSchema={field} />;
}

function StructuredFieldSection({
  name,
  field,
  value,
  allSchemas,
  nested,
}: {
  name: string;
  field: FieldSchema;
  value: unknown;
  allSchemas: Record<string, KindSchema>;
  nested: boolean;
}) {
  if (field.type === "array" && Array.isArray(value)) {
    const itemSchema = resolveItemSchema(field, allSchemas);

    return (
      <div className="space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {formatBlockLabel(name)} ({value.length})
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {value.map((item, index) =>
            isRecord(item) ? (
              <ItemCard
                key={index}
                item={item}
                itemSchema={itemSchema}
                allSchemas={allSchemas}
                index={index}
                nested={nested}
              />
            ) : (
              <div
                key={index}
                className="rounded-md border border-dashed border-border px-2 py-2 text-[10px] text-muted-foreground"
              >
                {formatValue(item)}
              </div>
            ),
          )}
        </div>
      </div>
    );
  }

  if (field.type === "object" && isRecord(value)) {
    const refSchema = allSchemas[field.kind];
    return (
      <div className="rounded-md border border-border bg-muted/20 p-2">
        <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
          {formatBlockLabel(name)}
        </div>
        <dl className="space-y-1">
          {Object.entries(value).map(([key, val]) => (
            <FieldRow
              key={key}
              name={key}
              value={val}
              fieldSchema={refSchema?.fields[key]}
            />
          ))}
        </dl>
      </div>
    );
  }

  if (field.type === "inline_object" && isRecord(value)) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-2">
        <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
          {formatBlockLabel(name)}
        </div>
        <dl className="space-y-1">
          {Object.entries(value).map(([key, val]) => (
            <FieldRow
              key={key}
              name={key}
              value={val}
              fieldSchema={field.fields[key]}
            />
          ))}
        </dl>
      </div>
    );
  }

  return <FieldRow name={name} value={value} fieldSchema={field} />;
}

function BlockChrome({
  schema,
  snapshot,
  children,
}: {
  schema: KindSchema;
  snapshot: LiveBlockSnapshot;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="text-xs font-semibold text-foreground">
          {formatBlockLabel(schema.kind)}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {pathLabel(snapshot.path)}
        </span>
        <BlockStatusBadge complete={snapshot.complete} />
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
          generic
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function FlatKindRenderer({ schema, snapshot }: GenericBlockRenderProps) {
  const entries = Object.entries(schema.fields).filter(
    ([name]) => name in snapshot.value,
  );

  return (
    <BlockChrome schema={schema} snapshot={snapshot}>
      <dl className="space-y-1.5">
        {entries.map(([name, fieldSchema]) => (
          <FieldRow
            key={name}
            name={name}
            value={snapshot.value[name]}
            fieldSchema={fieldSchema}
          />
        ))}
        {Object.entries(snapshot.value)
          .filter(([name]) => name !== KIND_KEY && !(name in schema.fields))
          .map(([name, value]) => (
            <FieldRow key={name} name={name} value={value} />
          ))}
      </dl>
    </BlockChrome>
  );
}

function GridKindRenderer({
  schema,
  snapshot,
  allSchemas,
}: GenericBlockRenderProps) {
  const scalarFields: Array<[string, FieldSchema]> = [];
  const structuredFields: Array<[string, FieldSchema]> = [];

  for (const [name, field] of Object.entries(schema.fields)) {
    if (isScalarField(field)) {
      scalarFields.push([name, field]);
    } else {
      structuredFields.push([name, field]);
    }
  }

  return (
    <BlockChrome schema={schema} snapshot={snapshot}>
      {scalarFields.length > 0 && (
        <dl className="mb-3 space-y-1 rounded-md border border-border/60 bg-muted/15 p-2">
          {scalarFields.map(([name, fieldSchema]) => (
            <FieldRow
              key={name}
              name={name}
              value={snapshot.value[name]}
              fieldSchema={fieldSchema}
            />
          ))}
        </dl>
      )}
      <div className="space-y-3">
        {structuredFields.map(([name, field]) => (
          <StructuredFieldSection
            key={name}
            name={name}
            field={field}
            value={snapshot.value[name]}
            allSchemas={allSchemas}
            nested={false}
          />
        ))}
      </div>
    </BlockChrome>
  );
}

function NestedKindRenderer({
  schema,
  snapshot,
  allSchemas,
}: GenericBlockRenderProps) {
  const scalarFields: Array<[string, FieldSchema]> = [];
  const structuredFields: Array<[string, FieldSchema]> = [];

  for (const [name, field] of Object.entries(schema.fields)) {
    if (isScalarField(field)) {
      scalarFields.push([name, field]);
    } else {
      structuredFields.push([name, field]);
    }
  }

  return (
    <BlockChrome schema={schema} snapshot={snapshot}>
      {scalarFields.length > 0 && (
        <dl className="mb-3 space-y-1 rounded-md border border-border/60 bg-muted/15 p-2">
          {scalarFields.map(([name, fieldSchema]) => (
            <FieldRow
              key={name}
              name={name}
              value={snapshot.value[name]}
              fieldSchema={fieldSchema}
            />
          ))}
        </dl>
      )}
      <div className="space-y-3">
        {structuredFields.map(([name, field]) => (
          <StructuredFieldSection
            key={name}
            name={name}
            field={field}
            value={snapshot.value[name]}
            allSchemas={allSchemas}
            nested
          />
        ))}
      </div>
    </BlockChrome>
  );
}

/** Generic fallback when no custom block component is registered for a kind. */
export function GenericBlockRenderer(props: GenericBlockRenderProps) {
  const mode = schemaLayoutMode(props.schema, props.allSchemas);

  switch (mode) {
    case "flat":
      return <FlatKindRenderer {...props} />;
    case "grid":
      return <GridKindRenderer {...props} />;
    case "nested":
      return <NestedKindRenderer {...props} />;
  }
}
