"use client";

import { useState } from "react";
import { useDebounce } from "@/hooks/usehooks/useDebounce";
import { useFields, useRecordPage, useTable } from "@ai-matrx/records/react";
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

const RECORD_PAGE_SIZE = 100;

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
          <TableRecords table={chosenTable} onPick={onPick} />
        </CustomDataRecordsScope>
      ) : null}
    </div>
  );
}

function TableRecords({
  table,
  onPick,
}: {
  table: DataHomeTableRow;
  onPick: (item: MessagesCustomDataPick) => void;
}) {
  const [page, setPage] = useState(0);
  const [searchDraft, setSearchDraft] = useState("");
  const search = useDebounce(searchDraft, 300);
  const tableDetails = useTable(table.table_id);
  const fields = useFields(table.table_id);
  // useRecordPage searches and paginates through the store's authorized query;
  // page is zero-based and pageSize stays within the SDK's bounded page read.
  const records = useRecordPage(table.table_id, {
    pageSize: RECORD_PAGE_SIZE,
    page,
    search,
  });
  const fieldList = fields.data ?? [];
  const rows = records.data?.rows ?? [];
  const total = records.data?.total;
  const pageCount =
    total === null || total === undefined
      ? null
      : Math.max(1, Math.ceil(total / RECORD_PAGE_SIZE));
  const hasMore = pageCount !== null && page + 1 < pageCount;

  const pickRecord = (row: (typeof rows)[number]) => {
    const label = rowNameIn(tableDetails.data, row);
    const content = buildDirectiveFence("reference", "table_row", [
      { table_id: table.table_id, row_id: row.id, label },
    ]);
    onPick({ id: `${table.table_id}:${row.id}`, label, content });
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
          value={searchDraft}
          onChange={(event) => {
            setSearchDraft(event.target.value);
            setPage(0);
          }}
          placeholder="Search all records…"
          aria-label="Search all records"
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

      {records.error ? null : records.loading || searchDraft !== search ? (
        <p className="messages-custom-data-picker__state" role="status">
          <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
          {searchDraft ? "Searching records…" : "Loading records…"}
        </p>
      ) : rows.length === 0 ? (
        <p className="messages-custom-data-picker__state" role="status">
          {search.trim() ? "No matching records" : "No records in this table"}
        </p>
      ) : (
        <ul className="messages-custom-data-picker__rows">
          {rows.map((row) => {
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

      {!records.error && pageCount !== null && pageCount > 1 ? (
        <div
          className="messages-custom-data-picker__pagination"
          aria-label="Record pages"
        >
          <button
            type="button"
            className="messages-custom-data-picker__more"
            disabled={records.loading || searchDraft !== search || page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Previous page
          </button>
          <span aria-live="polite">
            Page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="messages-custom-data-picker__more"
            disabled={records.loading || searchDraft !== search || !hasMore}
            onClick={() => setPage((current) => current + 1)}
          >
            Next page
          </button>
        </div>
      ) : null}
    </section>
  );
}
