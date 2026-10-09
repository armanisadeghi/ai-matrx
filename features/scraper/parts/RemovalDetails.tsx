"use client";
import { detailsMap, typeMap } from "@/features/scraper/constants";
import { Checkbox } from "@/features/scraper/reusable/checkbox";
import React, { useState } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
  type MatrxDataTableCopyConfig,
} from "@ai-matrx/design-system/data-table";

type RemovalItem = {
  text: string;
  type: string;
  details: string;
  remover: string;
};

type RemovalRow = RemovalItem & { id: string };

interface RemovalDetailsProps {
  allRemovals: RemovalItem[];
}

const cleanText = (text: string) => text.replace(/\n+/g, " ").trim();

const display = (value: string, map: Record<string, string>) => map[value] || value;
const typeLabel = (row: RemovalItem) => display(row.type, typeMap);
const detailsLabel = (row: RemovalItem) => display(row.details, detailsMap);

const REMOVAL_COLUMNS: MatrxColumnDef<RemovalRow>[] = [
  {
    id: "text",
    header: "Text",
    accessorFn: (row) => cleanText(row.text),
    filter: "text",
    width: 520,
    frozen: true,
    cell: (row) => <span className="block truncate">{cleanText(row.text)}</span>,
  },
  {
    id: "type",
    header: "Type",
    accessorFn: typeLabel,
    filter: "select",
    width: 160,
  },
  {
    id: "details",
    header: "Details",
    accessorFn: detailsLabel,
    filter: "select",
    width: 160,
  },
  {
    id: "remover",
    header: "Remover",
    accessorFn: (row) => row.remover,
    filter: "select",
    width: 160,
  },
];

const REMOVAL_COPY: MatrxDataTableCopyConfig<RemovalRow> = {
  label: "Removal",
  listLabel: "Removals (this view)",
  location: "Scraper — removal details",
  rowKind: "scraper-removal",
  listKind: "scraper-removals",
  rowDescription: "One piece of text the scraper removed, with why and by what.",
  listDescription: "The text the scraper removed from a page, as currently shown.",
  humanRow: (row) =>
    [
      `Type: ${typeLabel(row)}`,
      `Details: ${detailsLabel(row)}`,
      `Remover: ${row.remover}`,
      `Text: ${row.text}`,
    ].join("\n"),
};

/**
 * Empty-input guard as its OWN component, above the hooked body.
 *
 * It used to be an early `return` above `filteredDetails` (useMemo), so the
 * render where removals arrived went from 5 hooks to 6 and React throws
 * "rendered more hooks than during the previous render".
 */
const RemovalDetails = ({ allRemovals }: RemovalDetailsProps) => {
  if (!allRemovals?.length) {
    return (
      <div className="p-4 text-gray-500 dark:text-gray-400">
        No removal details available
      </div>
    );
  }
  return <RemovalDetailsBody allRemovals={allRemovals} />;
};

const RemovalDetailsBody = ({ allRemovals }: RemovalDetailsProps) => {
  const [filterBlankText, setFilterBlankText] = useState(true);

  const rows: RemovalRow[] = allRemovals
    .map((item, index) => ({ ...item, id: String(index) }))
    .filter((item) => !filterBlankText || cleanText(item.text) !== "");

  return (
    <div className="h-full w-full flex flex-col p-4">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Checkbox
          checked={filterBlankText}
          onChange={() => setFilterBlankText(!filterBlankText)}
          label="Filter out blank text"
        />
      </div>

      <MatrxDataTable<RemovalRow>
        tableId="scraper/removal-details"
        data={rows}
        columns={REMOVAL_COLUMNS}
        getRowId={(row) => row.id}
        pageSize={0}
        density="condensed"
        viewTabs={false}
        toolbar={{ title: "Removal Details", searchPlaceholder: "Search text" }}
        copy={REMOVAL_COPY}
        emptyState={{ title: "No removals match" }}
      />
    </div>
  );
};

export default RemovalDetails;
