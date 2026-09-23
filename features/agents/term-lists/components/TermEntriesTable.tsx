"use client";

import { useState } from "react";
import { ClipboardPaste, Plus, X } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import {
  ENTRY_KINDS,
  KIND_LABELS,
  KIND_VALUE_HINT,
  kindNeedsValue,
  parseTermCsv,
  type EntryKind,
  type TermEntry,
} from "../types";

interface TermEntriesTableProps {
  entries: TermEntry[];
  onChange: (entries: TermEntry[]) => void;
  /** Kind for new rows and for pasted rows that name none. */
  defaultKind: EntryKind;
  /** Row numbers (1-based) with a problem, shown inline. */
  problemRows: ReadonlySet<number>;
}

/** Term | Value | Kind | Language — one row per entry, spreadsheet-dense. */
export function TermEntriesTable({
  entries,
  onChange,
  defaultKind,
  problemRows,
}: TermEntriesTableProps) {
  const [pasteOpen, setPasteOpen] = useState(false);

  const update = (index: number, patch: Partial<TermEntry>) => {
    onChange(entries.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  };
  const remove = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };
  const addRow = () => onChange([...entries, { term: "", kind: defaultKind }]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_9.5rem_5.5rem_2rem] items-center gap-1.5 border-b border-border px-1 pb-1 text-xs font-medium text-muted-foreground">
        <span>Term</span>
        <span>Value</span>
        <span>Kind</span>
        <span>Language</span>
        <span />
      </div>
      <div className="flex flex-col gap-1 py-1.5" data-testid="term-entries">
        {entries.map((entry, index) => {
          const needsValue = kindNeedsValue(entry.kind);
          const flagged = problemRows.has(index + 1);
          return (
            <div
              key={index}
              className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_9.5rem_5.5rem_2rem] items-center gap-1.5 px-1"
              data-row={index + 1}
            >
              <Input
                aria-label={`Term ${index + 1}`}
                value={entry.term}
                onChange={(e) => update(index, { term: e.target.value })}
                className={flagged && !entry.term.trim() ? "border-destructive" : undefined}
                placeholder="Term"
              />
              <Input
                aria-label={`Value ${index + 1}`}
                value={needsValue ? (entry.value ?? "") : ""}
                disabled={!needsValue}
                onChange={(e) => update(index, { value: e.target.value })}
                className={
                  flagged && needsValue && !(entry.value ?? "").trim()
                    ? "border-destructive"
                    : undefined
                }
                placeholder={needsValue ? KIND_VALUE_HINT[entry.kind] : "Not used"}
              />
              <Select
                value={entry.kind}
                onValueChange={(v) => update(index, { kind: v as EntryKind })}
              >
                <SelectTrigger aria-label={`Kind ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                aria-label={`Language ${index + 1}`}
                value={entry.language ?? ""}
                onChange={(e) => update(index, { language: e.target.value })}
                placeholder="Any"
              />
              <button
                type="button"
                aria-label={`Remove row ${index + 1}`}
                onClick={() => remove(index)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-1 px-1">
        <Button variant="ghost" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add row
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPasteOpen(true)}>
          <ClipboardPaste className="mr-1 h-3.5 w-3.5" />
          Paste CSV
        </Button>
      </div>
      <PasteCsvDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        defaultKind={defaultKind}
        onParsed={(parsed) => onChange([...entries.filter((e) => e.term.trim()), ...parsed])}
      />
    </div>
  );
}

function PasteCsvDialog({
  open,
  onOpenChange,
  defaultKind,
  onParsed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind: EntryKind;
  onParsed: (entries: TermEntry[]) => void;
}) {
  const [text, setText] = useState("");
  const preview = text.trim() ? parseTermCsv(text, defaultKind) : null;

  const apply = () => {
    if (!preview) return;
    onParsed(preview.entries);
    if (preview.skipped.length) {
      toast.warning(
        `Added ${preview.entries.length} rows; skipped ${preview.skipped.length}: ` +
          preview.skipped
            .slice(0, 3)
            .map((s) => `line ${s.line} (${s.reason})`)
            .join(", "),
      );
    } else {
      toast.success(`Added ${preview.entries.length} rows`);
    }
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Paste CSV</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Columns: term, value, kind, language. Copy straight from a spreadsheet or
          paste comma-separated lines. Rows without a kind use{" "}
          {KIND_LABELS[defaultKind]}.
        </p>
        <Textarea
          aria-label="CSV rows"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="font-mono text-xs"
          placeholder={"AI Matrx,A-I May-tricks,pronounce\nAll Green Recycling,,do not translate"}
        />
        {preview ? (
          <p className="text-xs text-muted-foreground" data-testid="csv-preview">
            {preview.entries.length} rows ready
            {preview.skipped.length ? `, ${preview.skipped.length} will be skipped` : ""}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={!preview?.entries.length}>
            Add rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
