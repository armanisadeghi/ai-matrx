"use client";

/**
 * Typed inline cell editor. Strings edit in-place; non-strings open a small
 * popover (Supabase-style). Commits into the parent draft map — never persists
 * until the floating Save pill fires.
 */

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import type { CellEditType } from "./types";
import { stringifyCellValue } from "./filter-engine";

interface EditableTableCellProps {
  value: unknown;
  editType: Exclude<CellEditType, false>;
  editOptions?: Array<{ value: string; label: string }>;
  display: React.ReactNode;
  dirty?: boolean;
  onCommit: (next: unknown) => void;
  className?: string;
}

export function EditableTableCell({
  value,
  editType,
  editOptions = [],
  display,
  dirty,
  onCommit,
  className,
}: EditableTableCellProps) {
  const [open, setOpen] = useState(false);

  if (editType === "string") {
    return (
      <InlineStringEditor
        value={stringifyCellValue(value)}
        display={display}
        dirty={dirty}
        onCommit={onCommit}
        className={className}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "w-full rounded px-0.5 text-left hover:bg-muted/60",
            dirty && "ring-1 ring-primary/40 bg-primary/5",
            className,
          )}
          title="Edit"
        >
          {display}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <TypedEditor
          editType={editType}
          value={value}
          editOptions={editOptions}
          onCommit={(next) => {
            onCommit(next);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

function InlineStringEditor({
  value,
  display,
  dirty,
  onCommit,
  className,
}: {
  value: string;
  display: React.ReactNode;
  dirty?: boolean;
  onCommit: (next: unknown) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
        className={cn(
          "w-full rounded px-0.5 text-left hover:bg-muted/60",
          dirty && "ring-1 ring-primary/40 bg-primary/5",
          className,
        )}
        title="Click to edit"
      >
        {display}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onCommit(draft);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(draft);
          setEditing(false);
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setEditing(false);
        }
      }}
      className="h-7 text-sm"
      style={{ fontSize: "16px" }}
    />
  );
}

function TypedEditor({
  editType,
  value,
  editOptions,
  onCommit,
  onCancel,
}: {
  editType: Exclude<CellEditType, false | "string">;
  value: unknown;
  editOptions: Array<{ value: string; label: string }>;
  onCommit: (next: unknown) => void;
  onCancel: () => void;
}) {
  if (editType === "boolean") {
    const checked = Boolean(value);
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium">Value</span>
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCommit(v === true)}
        />
      </div>
    );
  }

  if (editType === "number") {
    return (
      <NumberEditor
        value={typeof value === "number" ? value : Number(value) || 0}
        onCommit={onCommit}
        onCancel={onCancel}
      />
    );
  }

  if (editType === "select") {
    return (
      <Select
        value={stringifyCellValue(value)}
        onValueChange={(v) => onCommit(v)}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {editOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // date
  return (
    <Input
      type="date"
      defaultValue={stringifyCellValue(value).slice(0, 10)}
      className="h-8 text-xs"
      style={{ fontSize: "16px" }}
      onChange={(e) => {
        if (e.target.value) onCommit(e.target.value);
      }}
    />
  );
}

function NumberEditor({
  value,
  onCommit,
  onCancel,
}: {
  value: number;
  onCommit: (next: unknown) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-8 font-mono text-xs"
        style={{ fontSize: "16px" }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = Number(draft);
            if (Number.isFinite(n)) onCommit(n);
          }
          if (e.key === "Escape") onCancel();
        }}
      />
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7"
          onClick={() => {
            const n = Number(draft);
            if (Number.isFinite(n)) onCommit(n);
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
