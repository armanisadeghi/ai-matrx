"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Check, ChevronDown, Copy, Loader2 } from "lucide-react";

import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/lib/toast";
import {
  buildDataTableAgentInput,
  dataTableRowsToMarkdown,
  type DataTableCopyField,
  type DataTableCopyRow,
  type DataTableCopyScope,
} from "@/features/data-tables/table-copy";

const TableCustomCopyWindow = dynamic(
  () =>
    import("@/features/data-tables/components/TableCustomCopyWindow").then(
      (module) => module.TableCustomCopyWindow,
    ),
  { ssr: false },
);

type CopyMode = "human" | "ai";

export interface TableCopyControlsProps {
  tableId: string;
  tableName: string;
  fields: DataTableCopyField[];
  selectedRowIds: string[];
  loadRows: () => Promise<DataTableCopyRow[]>;
  className?: string;
}

export function TableCopyControls({
  tableId,
  tableName,
  fields,
  selectedRowIds,
  loadRows,
  className,
}: TableCopyControlsProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<CopyMode | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customMode, setCustomMode] = useState<CopyMode>("human");
  const [customLoading, setCustomLoading] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [customRows, setCustomRows] = useState<DataTableCopyRow[]>([]);
  const [fieldIds, setFieldIds] = useState<string[]>(
    fields.map((field) => field.id),
  );
  const [customRowIds, setCustomRowIds] = useState<string[]>([]);

  const copyRows = async (
    mode: CopyMode,
    rows: DataTableCopyRow[],
    chosenFields: DataTableCopyField[],
    scope: DataTableCopyScope,
  ) => {
    if (rows.length === 0) {
      toast.info("Choose at least one row to copy");
      return false;
    }
    if (chosenFields.length === 0) {
      toast.info("Choose at least one column to copy");
      return false;
    }

    const text =
      mode === "ai"
        ? buildAgentPayload(
            buildDataTableAgentInput({
              tableId,
              tableName,
              rows,
              fields: chosenFields,
              scope,
            }),
          )
        : dataTableRowsToMarkdown(tableName, rows, chosenFields);
    await writeClipboard(text);
    setCopied(mode);
    window.setTimeout(() => setCopied(null), 1500);
    toast.success(
      `${tableName} copied${mode === "ai" ? " for AI" : ""} — ${rows.length} ${rows.length === 1 ? "row" : "rows"}, ${chosenFields.length} ${chosenFields.length === 1 ? "column" : "columns"}`,
    );
    return true;
  };

  const runCopy = async (mode: CopyMode, scope: "all" | "selected") => {
    if (busy) return;
    setBusy(true);
    try {
      const allRows = await loadRows();
      const selectedSet = new Set(selectedRowIds);
      const rows =
        scope === "selected"
          ? allRows.filter((row) => selectedSet.has(row.id))
          : allRows;
      await copyRows(mode, rows, fields, scope === "all" ? "view" : scope);
    } catch (error: unknown) {
      toast.error(
        `Couldn't copy table: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const loadCustomRows = async () => {
    setCustomLoading(true);
    setCustomError(null);
    try {
      const rows = await loadRows();
      setCustomRows(rows);
      // Custom copy is faithful by default. Search, filters, and the controlled
      // selection then let the user remove exactly what they do not want.
      setCustomRowIds(rows.map((row) => row.id));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      setCustomError(message);
      toast.error(`Couldn't load table rows: ${message}`);
    } finally {
      setCustomLoading(false);
    }
  };

  const openCustom = (mode: CopyMode) => {
    setCustomMode(mode);
    setFieldIds(fields.map((field) => field.id));
    setCustomRows([]);
    setCustomRowIds([]);
    setCustomOpen(true);
    void loadCustomRows();
  };

  const submitCustom = async () => {
    const chosenFieldSet = new Set(fieldIds);
    const chosenFields = fields.filter((field) => chosenFieldSet.has(field.id));
    const chosenRowSet = new Set(customRowIds);
    const rows = customRows.filter((row) => chosenRowSet.has(row.id));
    setBusy(true);
    try {
      await copyRows(customMode, rows, chosenFields, "custom");
    } catch (error: unknown) {
      toast.error(
        `Couldn't copy table: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const selectionAvailable = selectedRowIds.length > 0;

  return (
    <>
      <div className={`flex items-center gap-1 ${className ?? ""}`}>
        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-r-none"
            disabled={busy}
            onClick={() => void runCopy("human", "all")}
            aria-label="Copy table"
            title="Copy table"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : copied === "human" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          <CopyScopeMenu
            label="Copy options"
            disabled={busy}
            selectionAvailable={selectionAvailable}
            onAll={() => void runCopy("human", "all")}
            onSelected={() => void runCopy("human", "selected")}
            onCustom={() => openCustom("human")}
          />
        </div>

        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7 rounded-r-none"
            disabled={busy}
            onClick={() => void runCopy("ai", "all")}
            aria-label="Copy table for AI"
            title="Copy table for AI"
          >
            {copied === "ai" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <CopyForAiIcon className="h-3.5 w-3.5" />
            )}
          </Button>
          <CopyScopeMenu
            label="Copy for AI options"
            disabled={busy}
            selectionAvailable={selectionAvailable}
            onAll={() => void runCopy("ai", "all")}
            onSelected={() => void runCopy("ai", "selected")}
            onCustom={() => openCustom("ai")}
          />
        </div>
      </div>

      {customOpen ? (
        <TableCustomCopyWindow
          tableId={tableId}
          tableName={tableName}
          mode={customMode}
          fields={fields}
          rows={customRows}
          sourceSelectedRowIds={selectedRowIds}
          fieldIds={fieldIds}
          onFieldIdsChange={setFieldIds}
          rowIds={customRowIds}
          onRowIdsChange={setCustomRowIds}
          loading={customLoading}
          error={customError}
          busy={busy}
          onRetry={() => void loadCustomRows()}
          onCopy={() => void submitCustom()}
          onClose={() => setCustomOpen(false)}
        />
      ) : null}
    </>
  );
}

function CopyScopeMenu({
  label,
  disabled,
  selectionAvailable,
  onAll,
  onSelected,
  onCustom,
}: {
  label: string;
  disabled: boolean;
  selectionAvailable: boolean;
  onAll: () => void;
  onSelected: () => void;
  onCustom: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7 rounded-l-none border-l-0"
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onAll}>Current table view</DropdownMenuItem>
        <DropdownMenuItem disabled={!selectionAvailable} onSelect={onSelected}>
          Selected rows
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCustom}>
          Choose rows &amp; columns…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
