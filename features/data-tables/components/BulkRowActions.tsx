/**
 * BulkRowActions — the bar that appears when rows are selected.
 *
 * It used to offer "Select this page" and "Clear selection" and nothing else,
 * which made selecting rows a dead end: the user did the work of picking rows
 * and the surface had no answer. Every action here compiles to ONE
 * `udt_bulk_write` transaction (see `bulk-row-actions.ts`), so a 40-row delete
 * either happens or does not — never half.
 *
 * DESTRUCTION IS CONFIRMED, EVERYTHING ELSE IS UNDOABLE. Delete cannot be
 * undone from the cell stack (the rows are gone, and their ids with them), so
 * it goes through `ConfirmDialog` with the exact count. Set-column and fill-down
 * ARE undoable, so they run without a prompt — a dialog in front of a reversible
 * action just teaches people to click through dialogs.
 */
"use client";

import { useState } from "react";
import {
  ArrowDownToLine,
  Copy,
  CopyPlus,
  Eraser,
  Loader2,
  PencilLine,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { confirm as confirmDialog } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/components/ui/use-toast";

import type { TableField } from "@/utils/user-table-utls/table-utils";

import {
  buildDeleteOps,
  buildDuplicateOps,
  buildFillDownOps,
  buildSetColumnOps,
  orderSelectedRows,
  selectedRowsToTsv,
  type SelectableRow,
} from "../bulk-row-actions";

type Props = {
  selectedRowIds: string[];
  displayRows: SelectableRow[];
  fields: TableField[];
  readOnly: boolean;
  /** True when every row currently on screen is already selected. */
  allOnPageSelected: boolean;
  onSelectPage: () => void;
  onClearSelection: () => void;
  /** Runs one bulk transaction. Returns true when it landed. */
  onRunOps: (
    ops: ReturnType<typeof buildDeleteOps>,
    describe: string,
  ) => Promise<boolean>;
  /** Set one column across the selection, recording undo for each cell. */
  onSetColumn: (fieldName: string, value: string) => Promise<void>;
  onFillDown: (fieldName: string) => Promise<void>;
};

export function BulkRowActions({
  selectedRowIds,
  displayRows,
  fields,
  readOnly,
  allOnPageSelected,
  onSelectPage,
  onClearSelection,
  onRunOps,
  onSetColumn,
  onFillDown,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [setColumnField, setSetColumnField] = useState<string>("");
  const [setColumnValue, setSetColumnValue] = useState("");
  const [fillField, setFillField] = useState<string>("");

  const count = selectedRowIds.length;
  if (count === 0) return null;

  const selected = orderSelectedRows(displayRows, selectedRowIds);
  const noun = count === 1 ? "row" : "rows";

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = () =>
    void run(async () => {
      const ok = await confirmDialog({
        title: `Delete ${count} ${noun}?`,
        // Name the real consequence. Cell edits are undoable; these rows are not.
        description:
          "The rows and everything in them are removed. Row history keeps a record, but Undo cannot bring them back.",
        confirmLabel: `Delete ${count} ${noun}`,
        variant: "destructive",
      });
      if (!ok) return;
      const landed = await onRunOps(
        buildDeleteOps(selectedRowIds),
        `Deleted ${count} ${noun}`,
      );
      if (landed) onClearSelection();
    });

  const handleDuplicate = () =>
    void run(async () => {
      await onRunOps(
        buildDuplicateOps(selected),
        `Duplicated ${count} ${noun}`,
      );
    });

  const handleCopy = () =>
    void run(async () => {
      const tsv = selectedRowsToTsv(selected, fields);
      try {
        await navigator.clipboard.writeText(tsv);
        toast({
          title: `Copied ${count} ${noun}`,
          description: "Paste straight into a spreadsheet.",
        });
      } catch {
        toast({
          title: "Could not copy",
          description: "The browser refused clipboard access.",
          variant: "destructive",
        });
      }
    });

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2 py-1.5">
      <span className="text-xs font-medium tabular-nums">
        {count.toLocaleString()} {noun} selected
      </span>

      {!allOnPageSelected && displayRows.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onSelectPage}
        >
          Select this page
        </Button>
      )}

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs"
        disabled={busy}
        onClick={handleCopy}
      >
        <Copy className="h-3.5 w-3.5" />
        Copy
      </Button>

      {!readOnly && (
        <>
          {/* Set one column across the selection — the bulk cleanup people
              actually need, and undoable because it is cell writes. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={busy}
              >
                <PencilLine className="h-3.5 w-3.5" />
                Set a column
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2 p-3">
              <p className="text-xs font-medium text-foreground">
                Set one column on {count} {noun}
              </p>
              <Select value={setColumnField} onValueChange={setSetColumnField}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Choose a column" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.id} value={f.field_name}>
                      {f.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={setColumnValue}
                onChange={(e) => setSetColumnValue(e.target.value)}
                placeholder="New value"
                className="h-8 text-sm"
                style={{ fontSize: "16px" }}
              />
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  disabled={!setColumnField || busy}
                  onClick={() =>
                    void run(async () => {
                      await onSetColumn(setColumnField, setColumnValue);
                      setSetColumnValue("");
                    })
                  }
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  disabled={!setColumnField || busy}
                  title="Empty this column on every selected row"
                  onClick={() =>
                    void run(() => onSetColumn(setColumnField, ""))
                  }
                >
                  <Eraser className="h-3.5 w-3.5" />
                  Clear
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* Fill down — copy the first selected row's value into the rest. */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={busy || count < 2}
                title={
                  count < 2
                    ? "Select two or more rows to fill down"
                    : "Copy the first selected row's value down"
                }
              >
                <ArrowDownToLine className="h-3.5 w-3.5" />
                Fill down
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 space-y-2 p-3">
              <p className="text-xs text-muted-foreground">
                Copies the first selected row&apos;s value into the other{" "}
                {count - 1}.
              </p>
              <Select value={fillField} onValueChange={setFillField}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Choose a column" />
                </SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.id} value={f.field_name}>
                      {f.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                className="h-7 w-full text-xs"
                disabled={!fillField || busy}
                onClick={() => void run(() => onFillDown(fillField))}
              >
                Fill down
              </Button>
            </PopoverContent>
          </Popover>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={busy}
            onClick={handleDuplicate}
          >
            <CopyPlus className="h-3.5 w-3.5" />
            Duplicate
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-destructive hover:text-destructive"
            disabled={busy}
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </>
      )}

      {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto h-7 gap-1.5 px-2 text-xs"
        onClick={onClearSelection}
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </Button>
    </div>
  );
}
