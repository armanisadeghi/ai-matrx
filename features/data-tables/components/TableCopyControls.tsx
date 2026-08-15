"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown, Copy, Loader2 } from "lucide-react";

import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast";
import {
  buildDataTableAgentInput,
  dataTableRowLabel,
  dataTableRowsToMarkdown,
  type DataTableCopyField,
  type DataTableCopyRow,
  type DataTableCopyScope,
} from "@/features/data-tables/table-copy";

type CopyMode = "human" | "ai";
type RowChoice = "all" | "selected" | "custom";

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
  const [customRows, setCustomRows] = useState<DataTableCopyRow[]>([]);
  const [fieldIds, setFieldIds] = useState<string[]>(
    fields.map((field) => field.id),
  );
  const [rowChoice, setRowChoice] = useState<RowChoice>("all");
  const [customRowIds, setCustomRowIds] = useState<string[]>([]);

  const openCustom = async (mode: CopyMode) => {
    setCustomMode(mode);
    setFieldIds(fields.map((field) => field.id));
    setRowChoice("all");
    setCustomOpen(true);
    setCustomLoading(true);
    try {
      const rows = await loadRows();
      setCustomRows(rows);
      setCustomRowIds(rows.length <= 20 ? rows.map((row) => row.id) : []);
    } catch (error: unknown) {
      toast.error(
        `Couldn't load table rows: ${error instanceof Error ? error.message : String(error)}`,
      );
      setCustomOpen(false);
    } finally {
      setCustomLoading(false);
    }
  };

  const runCopy = async (
    mode: CopyMode,
    scope: Exclude<RowChoice, "custom">,
  ) => {
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

  const copyRows = async (
    mode: CopyMode,
    rows: DataTableCopyRow[],
    chosenFields: DataTableCopyField[],
    scope: DataTableCopyScope,
  ) => {
    if (rows.length === 0) {
      toast.info("Choose at least one row to copy");
      return;
    }
    if (chosenFields.length === 0) {
      toast.info("Choose at least one column to copy");
      return;
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
  };

  const submitCustom = async () => {
    const chosenFieldSet = new Set(fieldIds);
    const chosenFields = fields.filter((field) => chosenFieldSet.has(field.id));
    const selectedSet = new Set(selectedRowIds);
    const customSet = new Set(customRowIds);
    const rows =
      rowChoice === "selected"
        ? customRows.filter((row) => selectedSet.has(row.id))
        : rowChoice === "custom"
          ? customRows.filter((row) => customSet.has(row.id))
          : customRows;
    await copyRows(customMode, rows, chosenFields, "custom");
    if (rows.length > 0 && chosenFields.length > 0) setCustomOpen(false);
  };

  const selectionAvailable = selectedRowIds.length > 0;
  const smallTable = customRows.length <= 20;

  return (
    <>
      <div className={`flex items-center gap-1 ${className ?? ""}`}>
        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 rounded-r-none px-2"
            disabled={busy}
            onClick={() => void runCopy("human", "all")}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : copied === "human" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            Copy
          </Button>
          <CopyScopeMenu
            label="Copy options"
            disabled={busy}
            selectionAvailable={selectionAvailable}
            onAll={() => void runCopy("human", "all")}
            onSelected={() => void runCopy("human", "selected")}
            onCustom={() => void openCustom("human")}
          />
        </div>

        <div className="flex items-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 rounded-r-none px-2"
            disabled={busy}
            onClick={() => void runCopy("ai", "all")}
          >
            {copied === "ai" ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <CopyForAiIcon className="h-3.5 w-3.5" />
            )}
            Copy for AI
          </Button>
          <CopyScopeMenu
            label="Copy for AI options"
            disabled={busy}
            selectionAvailable={selectionAvailable}
            onAll={() => void runCopy("ai", "all")}
            onSelected={() => void runCopy("ai", "selected")}
            onCustom={() => void openCustom("ai")}
          />
        </div>
      </div>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Custom {customMode === "ai" ? "Copy for AI" : "Copy"}
            </DialogTitle>
            <DialogDescription>
              Choose exactly which columns and rows to include. Nothing in the
              table is changed.
            </DialogDescription>
          </DialogHeader>

          {customLoading ? (
            <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading table data…
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
              <CopyChoiceList
                title="Columns"
                selectedCount={fieldIds.length}
                totalCount={fields.length}
                onAll={() => setFieldIds(fields.map((field) => field.id))}
                onClear={() => setFieldIds([])}
              >
                {fields.map((field) => (
                  <ChoiceRow
                    key={field.id}
                    checked={fieldIds.includes(field.id)}
                    label={field.display_name}
                    onCheckedChange={(checked) =>
                      setFieldIds((current) =>
                        checked
                          ? [...new Set([...current, field.id])]
                          : current.filter((id) => id !== field.id),
                      )
                    }
                  />
                ))}
              </CopyChoiceList>

              <section className="min-h-0 space-y-2 rounded-lg border border-border p-3">
                <div>
                  <h3 className="text-sm font-semibold">Rows</h3>
                  <p className="text-xs text-muted-foreground">
                    {customRows.length.toLocaleString()} rows in this view
                  </p>
                </div>
                <RadioGroup
                  value={rowChoice}
                  onValueChange={(value) => setRowChoice(value as RowChoice)}
                  className="gap-2"
                >
                  <RadioChoice
                    value="all"
                    label={`All ${customRows.length.toLocaleString()} rows`}
                  />
                  <RadioChoice
                    value="selected"
                    label={`${selectedRowIds.length.toLocaleString()} selected in table`}
                    disabled={!selectionAvailable}
                  />
                  {smallTable ? (
                    <RadioChoice
                      value="custom"
                      label={`${customRowIds.length.toLocaleString()} checked below`}
                    />
                  ) : null}
                </RadioGroup>

                {smallTable ? (
                  <CopyChoiceList
                    title="Pick individual rows"
                    selectedCount={customRowIds.length}
                    totalCount={customRows.length}
                    onAll={() =>
                      setCustomRowIds(customRows.map((row) => row.id))
                    }
                    onClear={() => setCustomRowIds([])}
                    compact
                  >
                    {customRows.map((row) => (
                      <ChoiceRow
                        key={row.id}
                        checked={customRowIds.includes(row.id)}
                        label={dataTableRowLabel(row, fields)}
                        onCheckedChange={(checked) => {
                          setRowChoice("custom");
                          setCustomRowIds((current) =>
                            checked
                              ? [...new Set([...current, row.id])]
                              : current.filter((id) => id !== row.id),
                          );
                        }}
                      />
                    ))}
                  </CopyChoiceList>
                ) : (
                  <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    For larger tables, use the row checkboxes in the table, then
                    choose “selected in table” here.
                  </p>
                )}
              </section>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCustomOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={customLoading || fieldIds.length === 0}
              onClick={() => void submitCustom()}
            >
              {customMode === "ai" ? (
                <CopyForAiIcon className="h-4 w-4" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              Copy {customMode === "ai" ? "for AI" : "selection"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function CopyChoiceList({
  title,
  selectedCount,
  totalCount,
  onAll,
  onClear,
  compact = false,
  children,
}: {
  title: string;
  selectedCount: number;
  totalCount: number;
  onAll: () => void;
  onClear: () => void;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={
        compact
          ? "min-h-0 space-y-2"
          : "min-h-0 space-y-2 rounded-lg border border-border p-3"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">
            {selectedCount} of {totalCount} selected
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onAll}
          >
            Select all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onClear}
          >
            Clear all
          </Button>
        </div>
      </div>
      <ScrollArea className={compact ? "h-44 pr-3" : "h-64 pr-3"}>
        <div className="space-y-1">{children}</div>
      </ScrollArea>
    </section>
  );
}

function ChoiceRow({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
      <Checkbox
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        aria-label={`Include ${label}`}
      />
      <span className="min-w-0 truncate" title={label}>
        {label}
      </span>
    </label>
  );
}

function RadioChoice({
  value,
  label,
  disabled = false,
}: {
  value: RowChoice;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-8 items-center gap-2 text-sm">
      <RadioGroupItem value={value} disabled={disabled} />
      <span className={disabled ? "text-muted-foreground" : undefined}>
        {label}
      </span>
    </label>
  );
}
