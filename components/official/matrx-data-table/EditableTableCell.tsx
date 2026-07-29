"use client";

/**
 * Typed inline cell editor. Strings edit in-place; non-strings open a small
 * popover (Supabase-style). Commits into the parent draft map — never persists
 * until the floating Save pill fires.
 */

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, X } from "lucide-react";
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
  /**
   * D112: when the cell doubles as the row's title link, the display renders
   * as a real anchor (keyboard focus, SR semantics, middle-click) and editing
   * moves to a hover/focus-revealed pencil instead of click-text-to-edit.
   */
  href?: string;
  /**
   * `"pencil"` (or any `href`) → hover pencil only. `"click"` (default) →
   * click the cell body to edit. Whole-row click owners use `"pencil"` so the
   * body doesn't steal the gesture into edit mode.
   */
  editTrigger?: "click" | "pencil";
}

/** Display + hover-pencil shell; optional real link when `href` is set. */
function CellEditShell({
  href,
  display,
  dirty,
  className,
  editButton,
}: {
  href?: string;
  display: React.ReactNode;
  dirty?: boolean;
  className?: string;
  editButton: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        // overflow-hidden + min-w-0: table cells grow to min-content by default,
        // so a 10-page description must be clipped here — never via truncate on
        // this flex row (nowrap would stretch the whole table horizontally).
        "group/cell-link flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden rounded px-0.5",
        dirty && "ring-1 ring-primary/40 bg-primary/5",
        className,
      )}
    >
      {href ? (
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 overflow-hidden truncate rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {display}
        </Link>
      ) : (
        <span className="block min-w-0 flex-1 overflow-hidden">{display}</span>
      )}
      {editButton}
    </span>
  );
}

const CELL_PENCIL_CLASS =
  "shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted/60 focus-visible:opacity-100 group-hover/cell-link:opacity-100";

export function EditableTableCell({
  value,
  editType,
  editOptions = [],
  display,
  dirty,
  onCommit,
  className,
  href,
  editTrigger = "click",
}: EditableTableCellProps) {
  const [open, setOpen] = useState(false);
  // A linked cell always edits via pencil — the body is a real navigable link.
  const usePencil = Boolean(href) || editTrigger === "pencil";

  if (editType === "string") {
    return (
      <InlineStringEditor
        value={stringifyCellValue(value)}
        display={display}
        dirty={dirty}
        onCommit={onCommit}
        className={className}
        href={href}
        usePencil={usePencil}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {usePencil ? (
        <CellEditShell
          href={href}
          display={display}
          dirty={dirty}
          className={className}
          editButton={
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Edit"
                title="Edit"
                onClick={(e) => e.stopPropagation()}
                className={CELL_PENCIL_CLASS}
              >
                <Pencil className="h-3 w-3" />
              </button>
            </PopoverTrigger>
          }
        />
      ) : (
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
      )}
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
  href,
  usePencil,
}: {
  value: string;
  display: React.ReactNode;
  dirty?: boolean;
  onCommit: (next: unknown) => void;
  className?: string;
  href?: string;
  usePencil: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    if (usePencil) {
      return (
        <CellEditShell
          href={href}
          display={display}
          dirty={dirty}
          className={className}
          editButton={
            <button
              type="button"
              aria-label="Edit"
              title="Edit"
              onClick={(e) => {
                e.stopPropagation();
                setDraft(value);
                setEditing(true);
              }}
              className={CELL_PENCIL_CLASS}
            >
              <Pencil className="h-3 w-3" />
            </button>
          }
        />
      );
    }
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

  if (editType === "tags") {
    return (
      <TagsEditor
        value={Array.isArray(value) ? value.map(String) : []}
        suggestions={editOptions}
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

/**
 * Chips + free text. Existing values are offered as suggestions but never
 * enforced — a tag vocabulary that cannot grow from the row it describes stops
 * being used.
 */
function TagsEditor({
  value,
  suggestions,
  onCommit,
  onCancel,
}: {
  value: string[];
  suggestions: Array<{ value: string; label: string }>;
  onCommit: (next: unknown) => void;
  onCancel: () => void;
}) {
  const [tags, setTags] = useState<string[]>(value);
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const next = raw.trim();
    if (!next || tags.includes(next)) return;
    setTags([...tags, next]);
    setDraft("");
  };

  const matches = suggestions
    .filter(
      (s) =>
        !tags.includes(s.value) &&
        s.value !== "__none__" &&
        (!draft || s.label.toLowerCase().includes(draft.trim().toLowerCase())),
    )
    .slice(0, 6);

  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1">
        {tags.length === 0 && (
          <span className="text-xs text-muted-foreground">No tags</span>
        )}
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => setTags(tags.filter((t) => t !== tag))}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-destructive hover:text-destructive"
            title={`Remove ${tag}`}
          >
            {tag}
            <X className="h-2.5 w-2.5" />
          </button>
        ))}
      </div>

      <Input
        autoFocus
        value={draft}
        placeholder="Add tag, press Enter"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Backspace" && !draft && tags.length > 0) {
            setTags(tags.slice(0, -1));
          }
        }}
        className="h-8 text-xs"
      />

      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {matches.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => add(s.value)}
              className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
            >
              + {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-1 pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" className="h-7 px-2" onClick={() => onCommit(tags)}>
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
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
