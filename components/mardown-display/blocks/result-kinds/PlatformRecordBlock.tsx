"use client";

/**
 * `platform_record` — the ONE component for the shape `data.read_record` answers
 * with: a single platform Record, read as the run's operator.
 *
 * WHY IT EXISTS. The kind was published live (2026-09-18 05:35Z) with a schema
 * and a fingerprint but `is_active = false` and NO `content_ir.kind_component`
 * row, and `matrx_graph/kinds.py` states in capitals that the engine IGNORES
 * `is_active` — so a workflow containing "Read a Record" is admitted and
 * executes TODAY, and what it emits reached the reader through
 * `generic_structured`, the can-never-fail floor that
 * `common-docs/policies/conversion-campaigns.md` § Law 4b says is not a
 * component. The node's own stated property — "never `generic_structured`" —
 * was false live (V-22, NEW-11). This closes the render leg.
 *
 * THE READER'S QUESTION: *which row is this, may I open it, and what am I NOT
 * being shown?* The floor answers none of the three: `entity_type`,
 * `record_id`, `table`, `organization_id`, `fields` and `hidden_fields` arrive
 * as six equal rows of a key/value dump, so the row's identity, its door and
 * the columns deliberately withheld from it all read as trivia beside a column
 * called `updated_at`.
 *
 * WHAT THIS ADDS, and nothing else:
 *  - the row's IDENTITY leads — the type's label and the row's own name, taken
 *    from whatever column the table carries (the node already resolved it);
 *  - the id is a DOOR through the ONE open path (`useOpenItemPresentation` via
 *    `RecordDoor`), gated on the item registry: an entity token with no wired
 *    opener renders NO control, because a control that cannot open is worse
 *    than none. The uuid is never printed as dead text where a door exists;
 *  - `hidden_fields` are NAMED — "not shown: …" — because the node withholds
 *    them on purpose and a silent absence is the defect it avoided server-side;
 *  - a degraded shape is a SENTENCE WITH ITS REMEDY, never an empty card: a
 *    refusal sentence the payload carries, a row with no readable columns, and
 *    a row with no tenancy stamp each say what happened and what to do;
 *  - the columns themselves go to `ResultValue` — the platform's honest value
 *    viewer — at `full` density. No second value viewer, no per-table layout:
 *    the columns are the table's business, exactly as the kind's docstring says.
 *
 * ONE COMPONENT, branching on the SHAPE. There is one Record shape for every
 * entity type on purpose (the kind's own ruling), so there is one component for
 * every entity type: a `google_document`, a `party` and a `calendar_event`
 * differ only in `fields`, and `fields` is rendered generically.
 *
 * See `result-kind-shared.tsx` for the route contract (resolver-only,
 * `serverData` cleared, descending-fidelity recovery) and the wrapper law. The
 * door helper is reused from the Google kinds' shared module rather than
 * re-implemented — there is ONE door.
 */

import React from "react";
import { Database, EyeOff, Info, Lock } from "lucide-react";
import { isTableKind, type Field } from "@ai-matrx/records";
import { RecordsProvider } from "@ai-matrx/records/react";
import {
  ProvenanceBadge,
  RecordLabelProvider,
  RecordValue,
  RecordsUiProvider,
  cardTitleField,
  cardWords,
  useRecordLabels } from "@ai-matrx/records-ui";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { PanelRightTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import InfoHint from "@/components/official/InfoHint";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import {
  useTableKind,
  useTableRecordDocument,
  type TableKindState,
} from "./use-table-record";

import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ResultValue } from "@ai-matrx/chat/tool-call-visualization/result-fields/ResultValue";
import {
  ChipRow,
  LeftoverFields,
  MetaStrip,
  RawRegion,
  Section,
  StateChip,
  StillArriving,
  isRecord,
  readKindValue,
  readText,
  type ResultKindBlockProps,
} from "./result-kind-shared";
import { RecordDoor } from "../google-kinds/google-result-shared";
import type { ItemType } from "@/features/item-presentation/types";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

/**
 * Every key this component prints itself. Exported so the render-leg suite can
 * census it: a key promoted here with no matching print statement is the exact
 * defect F-86 found on `site_id` (promoted, therefore skipped by `MetaStrip`,
 * therefore invisible).
 */
export const PROMOTED = [
  "entity_type",
  "record_id",
  "table",
  "entity_label",
  "record_label",
  "organization_id",
  "fields",
  "hidden_fields",
] as const;

/**
 * A refusal the payload itself carries. The node's six refusals are node
 * `Failure`s and travel as `node_error`, so a well-formed `platform_record`
 * never holds one — but a caller that composes the two, or a future step that
 * adds one, must not render as a successful read of an empty row. Read from the
 * first key that carries a sentence; nothing invented.
 */
const REFUSAL_KEYS = ["error", "refusal", "reason", "message"] as const;

function readRefusal(
  value: Record<string, unknown>,
): { sentence: string; key: string } | null {
  for (const key of REFUSAL_KEYS) {
    const sentence = readText(value[key]);
    if (sentence) return { sentence, key };
  }
  return null;
}

/** The strings in `hidden_fields`, or null when the key did not arrive as one. */
function readHidden(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const names = value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
  return names.length > 0 ? names : null;
}

/**
 * Said plainly, with the remedy: a sentence a reader can act on. Used for every
 * degraded state, so none of them can render as a blank region.
 */
const HonestNotice: React.FC<{
  tone: "warn" | "muted";
  headline: string;
  remedy?: string;
}> = ({ tone, headline, remedy }) => (
  <div
    className={cn(
      "min-w-0 space-y-1 rounded-md border p-2.5",
      tone === "warn" ? "border-warning/30 bg-warning/5" : "border-border bg-card",
    )}
  >
    <div
      className={cn(
        "flex items-start gap-1.5 text-xs font-semibold",
        tone === "warn" ? "text-warning" : "text-foreground",
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 break-words">{headline}</span>
    </div>
    {remedy ? (
      <p className="pl-5 text-xs leading-relaxed text-muted-foreground">{remedy}</p>
    ) : null}
  </div>
);

// ── A RECORD OF A TABLE (`table:<uuid>`, KINDS-GLUE wave 3 §5) ─────────────────────────
//
// THE SAME CARD in a chat, a note and the in-app canvas: every one of them reaches this file
// through the one kind route (`table:` → `platform_record`, component-registry.ts), and nothing
// else in the app draws a record of a Table outside the records-ui grid (guard 5,
// `check:shapes --gate=one-record-card`). The values draw through the Table's own Fields with
// `@ai-matrx/records-ui` — the same value drawer the grid, the board and the record panel use —
// inside the card's own records host and label provider, bound to the TABLE's organization (never
// the active one), so a member or a relation reads as its name, not an id.

/** One header line: icon, the record's words, the Table's name, then the trailing control. */
const TableCardHeader: React.FC<{
  title: string;
  tableName: string | null;
  trailing?: React.ReactNode;
}> = ({ title, tableName, trailing }) => (
  <div className="flex min-w-0 items-center gap-x-2">
    <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
    <span className="min-w-0 truncate text-sm font-medium text-foreground">{title}</span>
    {tableName ? <span className="shrink-0 truncate text-xs text-muted-foreground">{tableName}</span> : null}
    {trailing ? <span className="ml-auto flex shrink-0 items-center">{trailing}</span> : null}
  </div>
);

/** The store refused: a short label, the store's sentence on hover (B3). */
const TableCardRefused: React.FC<{ label: string; sentence: string; className?: string }> = ({
  label,
  sentence,
  className,
}) => (
  <div className={cn("my-2 flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-card p-2.5 text-xs", className)} data-table-record-card="refused">
    <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    <span className="font-medium text-foreground">{label}</span>
    <InfoHint text={sentence} label="Why" />
  </div>
);

const TableCardLoading: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("my-2 space-y-2 rounded-md border border-border bg-card p-2.5", className)} data-table-record-card="loading" aria-busy="true">
    <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
    <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
  </div>
);

const TableRecordBody: React.FC<{
  value: Record<string, unknown>;
  table: Extract<TableKindState, { state: "ready" }>;
  recordsTick: number;
  className?: string;
}> = ({ value, table, recordsTick, className }) => {
  const read = useTableRecordDocument(value, recordsTick);
  const labels = useRecordLabels(table.fields);
  const canvas = useOptionalCanvas();
  const { open } = useCanvas();
  if (read.state === "loading") return <TableCardLoading className={className} />;
  if (read.state === "refused") return <TableCardRefused label="Record unavailable" sentence={read.sentence} className={className} />;

  const titleField = cardTitleField(table.fields, table.titleKey);
  const title = cardWords({ id: read.recordId ?? "", document: read.document, hidden: read.hidden } as never, titleField, labels).text;
  const openInCanvas = canvas
    ? () => {
        open({ type: "kind_value", data: value, metadata: { title } });
      }
    : null;

  return (
    <div className={cn("my-2 min-w-0 space-y-2 rounded-md border border-border bg-card p-2.5", className)} data-table-record-card="ready">
      <TableCardHeader
        title={title}
        tableName={table.name}
        trailing={
          openInCanvas ? (
            <PanelRightTapButton variant="transparent" ariaLabel="Open in canvas" onClick={openInCanvas} />
          ) : null
        }
      />
      <dl className="grid min-w-0 grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
        {table.fields.map((field: Field) => (
          <React.Fragment key={field.id}>
            <dt className="truncate text-muted-foreground">{field.label || field.key}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 break-words text-foreground" data-field-key={field.key}>
              <RecordValue field={field} value={read.document[field.key]} document={read.document} withheld={read.hidden[field.key] ?? null} />
              <ProvenanceBadge document={read.document} fieldKey={field.key} />
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
};

function TableCardRecordsProvider({ organizationId, children }: { organizationId: string; children: React.ReactNode }) {
  const recordsConfig = useAppRecordsConfig(organizationId);
  return <RecordsProvider config={recordsConfig}>{children}</RecordsProvider>;
}

const TableRecordCard: React.FC<{ value: Record<string, unknown>; className?: string }> = ({ value, className }) => {
  const kind = String(value.__kind);
  const table = useTableKind(kind);
  if (table.state === "loading") return <TableCardLoading className={className} />;
  if (table.state === "refused") return <TableCardRefused label="No access to this table" sentence={table.sentence} className={className} />;
  return (
    <TableCardRecordsProvider organizationId={table.facts.organization_id}>
      <RecordsUiProvider value={{}}>
        <RecordLabelProvider>
          <TableRecordBody value={value} table={table} recordsTick={table.recordsTick} className={className} />
        </RecordLabelProvider>
      </RecordsUiProvider>
    </TableCardRecordsProvider>
  );
};

const PlatformRecordBlock: React.FC<ResultKindBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const { value, recovered, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value)) {
    // Zero data loss: the region never parsed, so it is shown verbatim.
    return <RawRegion content={content} className={className} />;
  }
  // A record of a Table draws as the one table record card.
  if (isTableKind(value.__kind)) {
    return streaming ? <StillArriving /> : <TableRecordCard value={value} className={className} />;
  }

  const entityType = readText(value.entity_type);
  const recordId = readText(value.record_id);
  const table = readText(value.table);
  const entityLabel = readText(value.entity_label);
  const recordLabel = readText(value.record_label);
  const organizationId = readText(value.organization_id);
  const fields = isRecord(value.fields) ? value.fields : null;
  const hidden = readHidden(value.hidden_fields);
  const refusal = readRefusal(value);

  const omit = refusal ? [...PROMOTED, refusal.key] : PROMOTED;

  // The TYPE's name: the registry's label when the node resolved one, otherwise
  // the token humanized — never a bare token where a person is reading.
  const typeName = entityLabel ?? (entityType ? (humanizeIdentifier(entityType) || entityType) : "Record");
  const fieldCount = fields ? Object.keys(fields).length : 0;

  return (
    <div className={cn("my-2 min-w-0 space-y-2.5", className)}>
      {streaming ? <StillArriving /> : null}

      {/* IDENTITY, then the door. The row is the headline; the plumbing is not. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 break-words text-sm font-medium text-foreground">
          {recordLabel ?? `${typeName} (this row carries no name)`}
        </span>
        <span className="text-xs text-muted-foreground">{typeName}</span>
        {entityType ? (
          <RecordDoor
            type={entityType as ItemType}
            id={recordId}
            name={recordLabel}
            fallbackLabel={typeName.toLowerCase()}
          />
        ) : null}
      </div>

      <ChipRow>
        {/* The schema-qualified table is provenance, not decoration: two tables
            can hold the same id and mean different things. */}
        {table ? <StateChip label={table} /> : null}
        {fields ? (
          <StateChip label={`${fieldCount} ${fieldCount === 1 ? "column" : "columns"}`} />
        ) : null}
      </ChipRow>

      {/* A sentence somebody else wrote about why this read did not answer. */}
      {refusal ? (
        <HonestNotice
          tone="warn"
          headline={refusal.sentence}
          remedy={
            "Nothing below was read from the row. Remedy: open the run's step to see " +
            "the named refusal in full, then fix what it names — the access, the id, " +
            "or the entity type."
          }
        />
      ) : null}

      {/* THE ROW. The platform's value viewer, at full density. */}
      {fields && fieldCount > 0 ? (
        <Section label="The record">
          <ResultValue value={fields} density="full" />
        </Section>
      ) : refusal ? null : (
        <HonestNotice
          tone="warn"
          headline="This record came back with no readable columns."
          remedy={
            "A row was found, so this is not a missing record — the columns did not " +
            "arrive. Remedy: check the entity registry's excluded columns for this " +
            "type, and the run's step output, before treating the row as empty."
          }
        />
      )}

      {/* WITHHELD, NAMED. The node drops these on purpose; a reader must know
          the row is wider than what is printed above. */}
      {hidden ? (
        <div className="flex min-w-0 items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">
            <span className="font-medium text-foreground">Not shown: </span>
            {hidden.join(", ")} — the entity registry withholds{" "}
            {hidden.length === 1 ? "this column" : "these columns"} from clients, so the
            read never returned {hidden.length === 1 ? "it" : "them"}.
          </span>
        </div>
      ) : null}

      {/* TENANCY, reported. Organization is never the access answer (the node
          says so), but a row with no stamp is a fact a reader should not have
          to infer from an absence. */}
      {organizationId ? (
        <div className="text-xs text-muted-foreground">
          <span>Organization stamp: </span>
          <EntityRef
            token="organization"
            id={organizationId}
            name={organizationId}
            showIcon={false}
            wrap
            labelClassName="font-mono text-foreground"
          />
        </div>
      ) : fields ? (
        <HonestNotice
          tone="muted"
          headline="This row carries no organization stamp."
          remedy={
            "The read still answered — tenancy is reported here, never the basis of " +
            "access. Remedy: if this type should be organization-scoped, the row " +
            "needs an organization_id; raise it with whoever owns the table."
          }
        />
      ) : null}

      {/* HIDE NOTHING: anything this component did not promote still arrives. */}
      {/* A fact shown twice reads as two different facts, so the key the
          refusal sentence came from is not repeated in the strip below. */}
      <MetaStrip value={value} omit={omit} />
      <LeftoverFields value={value} omit={omit} />
    </div>
  );
};

export default PlatformRecordBlock;
