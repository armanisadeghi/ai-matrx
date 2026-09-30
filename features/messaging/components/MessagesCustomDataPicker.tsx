"use client";

import { useState } from "react";
import { useFields, useRecords, useTable } from "@ai-matrx/records/react";
import { fieldName, rowNameIn } from "@ai-matrx/records-ui";
import { LoaderCircle, Search } from "lucide-react";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  CreatablePicker,
  type CreatableOption,
} from "@/components/ui/creatable-picker";
import { CustomDataRecordsScope } from "@/features/agents/components/variables-management/custom-data/CustomDataRecordsScope";
import { useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";
import { buildDirectiveFence } from "@/features/matrx-envelope/referenceFence";
import type { DataHomeTableRow } from "@/features/unified-data/hub/doors";

const RECORD_PAGE_SIZE = 200;

export interface MessagesCustomDataPick {
  id: string;
  label: string;
  content: string;
}

interface MessagesCustomDataPickerProps {
  onPick: (item: MessagesCustomDataPick) => void;
}

export default function MessagesCustomDataPicker({
  onPick,
}: MessagesCustomDataPickerProps) {
  const tables = useTablesEverywhere();
  const [tableId, setTableId] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const chosenTable =
    tables.rows.find((table) => table.table_id === tableId) ?? null;
  const options: CreatableOption[] = tables.rows.map((table) => ({
    value: table.table_id,
    label: table.table_name,
    hint: table.organization_name,
    keywords: `${table.organization_name} ${table.kind ?? ""}`,
  }));

  return (
    <div className="messages-custom-data-picker">
      <div className="messages-custom-data-picker__table">
        <CreatablePicker
          value={tableId ?? ""}
          options={options}
          onSelect={(id) => {
            setTableId(id);
            setTableSearch("");
          }}
          placeholder={
            tables.loading
              ? "Loading tables…"
              : tables.error
                ? "Tables could not be read"
                : options.length === 0
                  ? "No tables available"
                  : "Choose a table…"
          }
          searchPlaceholder="Search tables…"
          noun="table"
          loading={tables.loading}
          ariaLabel="Custom data table"
        />
        {tables.error ? (
          <p className="messages-custom-data-picker__error" role="alert">
            Tables could not be read. Try again.{" "}
            <button type="button" onClick={tables.reload}>
              Try again
            </button>
            <ErrorAlchemyMenu error={tables.error.message} />
          </p>
        ) : null}
      </div>

      {chosenTable ? (
        <CustomDataRecordsScope
          key={chosenTable.table_id}
          tableId={chosenTable.table_id}
          organizationId={chosenTable.organization_id}
          fallback={(held) =>
            held.state === "unavailable" ? (
              <p className="messages-custom-data-picker__error" role="alert">
                This table could not be opened: {held.why}{" "}
                <button type="button" onClick={held.retry}>
                  Try again
                </button>
                <ErrorAlchemyMenu error={held.why} />
              </p>
            ) : (
              <p className="messages-custom-data-picker__state" role="status">
                {held.state === "resolving"
                  ? "Opening table…"
                  : "This table is unavailable."}
              </p>
            )
          }
        >
          <TableRecords
            table={chosenTable}
            tableSearch={tableSearch}
            onTableSearch={setTableSearch}
            onPick={onPick}
          />
        </CustomDataRecordsScope>
      ) : null}
    </div>
  );
}

function TableRecords({
  table,
  tableSearch,
  onTableSearch,
  onPick,
}: {
  table: DataHomeTableRow;
  tableSearch: string;
  onTableSearch: (value: string) => void;
  onPick: (item: MessagesCustomDataPick) => void;
}) {
  const [pageSize, setPageSize] = useState(RECORD_PAGE_SIZE);
  const tableDetails = useTable(table.table_id);
  const fields = useFields(table.table_id);
  const records = useRecords(table.table_id, { pageSize });
  const fieldList = fields.data ?? [];
  const rows = records.data?.rows ?? [];
  const normalizedSearch = tableSearch.trim().toLocaleLowerCase();
  const shownRows = rows.filter((row) => {
    if (!normalizedSearch) return true;
    const label = rowNameIn(tableDetails.data, row);
    const values = fieldList
      .map(
        (field) =>
          `${fieldName(field)} ${String(row.document[field.key] ?? "")}`,
      )
      .join(" ");
    return `${label} ${values}`.toLocaleLowerCase().includes(normalizedSearch);
  });
  const total = records.data?.total;
  const hasMore = total !== null && total !== undefined && rows.length < total;

  const pickRecord = (row: (typeof rows)[number]) => {
    const label = rowNameIn(tableDetails.data, row);
    const content = buildDirectiveFence("reference", "record", [
      { id: row.id, label },
    ]);
    onPick({ id: row.id, label, content });
  };

  return (
    <section
      className="messages-custom-data-picker__records"
      aria-label={`Records in ${table.table_name}`}
    >
      <label className="messages-custom-data-picker__search">
        <Search size={16} aria-hidden="true" />
        <span className="sr-only">Search records</span>
        <input
          type="search"
          value={tableSearch}
          onChange={(event) => onTableSearch(event.target.value)}
          placeholder="Search records…"
          aria-label="Search records"
        />
      </label>

      {fields.error ? (
        <p className="messages-custom-data-picker__error" role="alert">
          Table fields could not be read.{" "}
          <button type="button" onClick={fields.reload}>
            Try again
          </button>
          <ErrorAlchemyMenu error={fields.error.message} />
        </p>
      ) : null}
      {tableDetails.error ? (
        <p className="messages-custom-data-picker__error" role="alert">
          Table details could not be read.{" "}
          <button type="button" onClick={tableDetails.reload}>
            Try again
          </button>
          <ErrorAlchemyMenu error={tableDetails.error.message} />
        </p>
      ) : null}
      {records.error ? (
        <p className="messages-custom-data-picker__error" role="alert">
          Records could not be read.{" "}
          <button type="button" onClick={records.reload}>
            Try again
          </button>
          <ErrorAlchemyMenu error={records.error.message} />
        </p>
      ) : null}

      {records.error ? null : records.loading && rows.length === 0 ? (
        <p className="messages-custom-data-picker__state" role="status">
          <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
          Loading records…
        </p>
      ) : shownRows.length === 0 ? (
        <p className="messages-custom-data-picker__state" role="status">
          {normalizedSearch
            ? "No matching records"
            : "No records in this table"}
        </p>
      ) : (
        <ul className="messages-custom-data-picker__rows">
          {shownRows.map((row) => {
            const label = rowNameIn(tableDetails.data, row);
            const hints = fieldList
              .filter(
                (field) =>
                  String(row.document[field.key] ?? "").trim().length > 0,
              )
              .slice(0, 2)
              .map(
                (field) =>
                  `${fieldName(field)}: ${String(row.document[field.key])}`,
              );
            return (
              <li key={row.id}>
                <button
                  type="button"
                  className="messages-custom-data-picker__row"
                  aria-label={`Add ${label}`}
                  onClick={() => pickRecord(row)}
                >
                  <span className="messages-custom-data-picker__row-name">
                    {label}
                  </span>
                  {hints.length > 0 ? (
                    <span className="messages-custom-data-picker__row-hint">
                      {hints.join(" · ")}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <button
          type="button"
          className="messages-custom-data-picker__more"
          disabled={records.loading}
          onClick={() => setPageSize((size) => size + RECORD_PAGE_SIZE)}
        >
          {records.loading ? "Loading…" : "Load more records"}
        </button>
      ) : null}
    </section>
  );
}
