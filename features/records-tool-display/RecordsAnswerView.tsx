// row-token: none — draws whatever rows a records-tool answer returns, from any table, not one registry token
"use client";

/**
 * RecordsAnswerView — what a data tool (`records`, `dataset`) did, drawn for the person who asked.
 *
 *  - Rows it read → the design system's one titled table (`MatrxTableCard` + `MatrxDataTable`),
 *    titled with the Table's name, columns named by its Fields, cells drawn by records-ui's
 *    `RecordValue`, with "Open the table" and THE one "Save to a table" (`useOpenSaveToTable`).
 *  - Records it wrote → one sentence naming the Table, and a door to the record (or the table).
 *  - Anything else → one sentence (`readRecordsAnswer`), never the result's JSON.
 *
 * The Table's name and Fields come from lane KINDS-GLUE's table-kind read (`useTableKind`, the data
 * half of the one record card): the same facts every `table:<id>` card reads, kept live while the
 * card is on screen. Nothing here prints an id: until the facts arrive the card says it is loading.
 *
 * A refusal is the tool's own sentence; the shell's approval card owns a held write; the shell's
 * shared diff owns a single-record change that carries a before → after receipt.
 */

import { useMemo } from "react";
import { AlertTriangle, ArrowUpRight, Database, TableProperties } from "lucide-react";
import { tableKindSlug, type Field } from "@ai-matrx/records";
import { RecordsProvider } from "@ai-matrx/records/react";
import {
  RecordLabelProvider,
  RecordValue,
  RecordsUiProvider,
  scalarText,
} from "@ai-matrx/records-ui";
import { MatrxDataTable, MatrxTableCard } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";
import { useOpenSaveToTable } from "@/features/overlays/openers/saveToTable";
import { useTableKind } from "@/components/mardown-display/blocks/result-kinds/use-table-record";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import type { ToolRendererProps } from "@ai-matrx/chat/tool-call-visualization/types";
import { resultAsObject } from "@ai-matrx/chat/tool-call-visualization/renderers/_shared";
import {
  readRecordsAnswer,
  tableHref,
  writeSentence,
  type AnswerRow,
  type RecordsAnswer,
} from "./readRecordsAnswer";
import { formatCount } from "@ai-matrx/kit/format";

/** Rows before "Show more" inside a chat turn. */
const ROWS_IN_A_TURN = 8;

function Line({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

function DoorLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

/** The Table's facts and the provider every records-ui value needs, or a sentence. */
function WithTable({
  tableId,
  children,
  fallback,
}: {
  tableId: string;
  children: (table: { name: string | null; fields: Field[] }) => React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const kind = useTableKind(tableKindSlug(tableId));
  if (kind.state === "loading") return <>{fallback ?? <Line>Loading the table…</Line>}</>;
  if (kind.state === "refused") return <Line>{kind.sentence}</Line>;
  return (
    <TableRecordsProvider organizationId={kind.facts.organization_id}>
      <RecordsUiProvider value={{}}>
        <RecordLabelProvider>{children({ name: kind.name, fields: kind.fields })}</RecordLabelProvider>
      </RecordsUiProvider>
    </TableRecordsProvider>
  );
}

function RowsTable({ answer }: { answer: Extract<RecordsAnswer, { kind: "rows" }> }) {
  return (
    <WithTable tableId={answer.tableId}>
      {(table) => <RowsCard answer={answer} name={table.name} fields={table.fields} />}
    </WithTable>
  );
}

function RowsCard({
  answer,
  name,
  fields,
}: {
  answer: Extract<RecordsAnswer, { kind: "rows" }>;
  name: string | null;
  fields: Field[];
}) {
  const openSaveToTable = useOpenSaveToTable();
  // Only the Fields the answer carries, in the Table's own order.
  const shown = useMemo(
    () => fields.filter((field) => answer.rows.some((row) => field.key in row.values)),
    [fields, answer.rows],
  );
  const columns = useMemo<MatrxColumnDef<AnswerRow>[]>(
    () =>
      shown.map((field) => ({
        id: field.key,
        header: field.label || field.key,
        label: field.label || field.key,
        accessorFn: (row) => row.values[field.key],
        copyValue: (row) => scalarText(field, row.values[field.key]),
        cell: (row) => (
          <RecordValue field={field} value={row.values[field.key]} recordId={row.recordId} inCell />
        ),
      })),
    [shown],
  );
  const title = name ?? "Table";
  const count = answer.total ?? answer.rows.length;
  const save = openSaveToTable
    ? () =>
        openSaveToTable({
          grid: {
            headers: shown.map((field) => field.label || field.key),
            rows: answer.rows.map((row) => shown.map((field) => scalarText(field, row.values[field.key]))),
          },
          title,
        })
    : null;

  if (answer.rows.length === 0) {
    return (
      <Line>
        No records matched in {title}. <DoorLink href={tableHref(answer.tableId)}>Open the table</DoorLink>
      </Line>
    );
  }

  return (
    <MatrxTableCard
      title={title}
      headingLevel={3}
      icon={<Database />}
      iconClassName="text-emerald-600 dark:text-emerald-400"
      records={{ count, singular: "record", plural: "records" }}
      {...(answer.partial ? { facts: [`${formatCount(answer.rows.length)} shown`] } : {})}
      open={{ href: tableHref(answer.tableId), label: "Open the table" }}
      headerActions={
        save ? (
          <Button icon={<TableProperties />} type="button" variant="quiet" onClick={save}>
            Save to a table
          </Button>
        ) : null
      }
      initialRows={ROWS_IN_A_TURN}
      className="p-3 shadow-none"
    >
      <MatrxDataTable<AnswerRow>
        data={answer.rows}
        columns={columns}
        getRowId={(row) => row.recordId ?? JSON.stringify(row.values)}
        getRowHref={(row) => tableHref(answer.tableId, row.recordId)}
        toolbar={{ singleRow: true, search: answer.rows.length > ROWS_IN_A_TURN }}
        detail={{ enabled: false }}
        viewTabs={false}
      />
      {answer.withheldNote ? <Line>{answer.withheldNote}</Line> : null}
    </MatrxTableCard>
  );
}

function WriteLine({ answer }: { answer: Extract<RecordsAnswer, { kind: "write" }> }) {
  const doors = (name: string | null) => (
    <Line>
      {writeSentence(answer, name)}{" "}
      {answer.tableId ? (
        <DoorLink href={tableHref(answer.tableId, answer.recordId)}>
          {answer.recordId ? "Open the record" : "Open the table"}
        </DoorLink>
      ) : null}
      {answer.notDone ? <span className="block text-amber-700 dark:text-amber-400">{answer.notDone}</span> : null}
    </Line>
  );
  if (!answer.tableId) return doors(null);
  return (
    <WithTable tableId={answer.tableId} fallback={doors(null)}>
      {(table) => doors(table.name)}
    </WithTable>
  );
}

function SentenceLine({ answer }: { answer: Extract<RecordsAnswer, { kind: "line" }> }) {
  return (
    <Line>
      {answer.text}{" "}
      {answer.tableId ? <DoorLink href={tableHref(answer.tableId)}>Open the table</DoorLink> : null}
    </Line>
  );
}

/** The answer view, or `null` when this answer is not one it draws (the caller's fallback draws). */
export function RecordsAnswerBody({ answer }: { answer: RecordsAnswer }) {
  if (answer.kind === "rows") return <RowsTable answer={answer} />;
  if (answer.kind === "write") return <WriteLine answer={answer} />;
  return <SentenceLine answer={answer} />;
}

/** A refusal: the store's own sentence. */
export function RefusalLine({ message }: { message: string | null }) {
  return (
    <div className="flex items-start gap-1.5 text-xs text-destructive">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>{message ?? "The record store refused the call."}</span>
      <ErrorAlchemyMenu error={message} />
    </div>
  );
}

/**
 * The renderer factory: draws what it reads, and hands every other answer to `Fallback` (the
 * tool's existing renderer), so registering it never takes a view away.
 */
export function answerRenderer(Fallback: React.ComponentType<ToolRendererProps>) {
  function DataToolAnswer(props: ToolRendererProps) {
    const { entry } = props;
    if (entry.status === "error") return <RefusalLine message={entry.errorMessage} />;
    const answer = readRecordsAnswer(resultAsObject(entry));
    if (!answer) return <Fallback {...props} />;
    return <RecordsAnswerBody answer={answer} />;
  }
  DataToolAnswer.displayName = `DataToolAnswer(${Fallback.displayName ?? Fallback.name ?? "Renderer"})`;
  return DataToolAnswer;
}

/** The records provider for the table's organization, from the app's one config. */
function TableRecordsProvider({ organizationId, children }: { organizationId: string; children: React.ReactNode }) {
  const recordsConfig = useAppRecordsConfig(organizationId);
  return <RecordsProvider config={recordsConfig}>{children}</RecordsProvider>;
}
