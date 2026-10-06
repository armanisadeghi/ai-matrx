"use client";

// features/spaces/data/menu-parts.tsx — the small pieces every database block's toolbar shares: a view
// tab (rename / duplicate / delete), a menu row, a field list.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Input } from "@ai-matrx/design-system/controls";
import { Copy, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import type { SpaceDbView } from "./sources";

export function ViewTab({
  view,
  icon,
  active,
  editable,
  onSelect,
  onRename,
  onDuplicate,
  onDelete,
  pill,
}: {
  view: SpaceDbView;
  icon: ReactNode;
  pill?: boolean;
  active: boolean;
  editable: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState(view.name);
  return (
    <Popover open={menu} onOpenChange={(o) => (editable ? setMenu(o) : null)}>
      <PopoverTrigger asChild>
        {pill ? (
          // A chart tile's title is the tile's own layout (Notion's grey pill), not a toolbar control.
          <button type="button" className="spaces-chart-title" role="tab" aria-selected={active}>
            {icon}
            <span>{view.name}</span>
          </button>
        ) : (
          <Button variant="quiet" role="tab" aria-selected={active} data-active={active ? "true" : undefined} onClick={(e) => {
              if (!active) {
                e.preventDefault();
                onSelect();
              }
            }}>
            {icon}
            <span>{view.name}</span>
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent surface="solid" align="start" width="sm" padding="xs">
        <div className="p-1">
          <Input
            value={name}
            aria-label="View name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onRename(name.trim() || view.name);
                setMenu(false);
              }
            }}
            onBlur={() => name.trim() && name !== view.name && onRename(name.trim())}
          />
        </div>
        <MenuRow icon={<Copy size={15} />} label="Duplicate view" onClick={() => (onDuplicate(), setMenu(false))} />
        {onDelete ? <MenuRow icon={<Trash2 size={15} />} label="Delete view" onClick={() => (onDelete(), setMenu(false))} /> : null}
      </PopoverContent>
    </Popover>
  );
}

export function MenuRow({ icon, label, onClick, end, active }: { icon?: ReactNode; label: string; onClick: () => void; end?: ReactNode; active?: boolean }) {
  return (
    // A row may end in a Switch (itself a button), so the row is a focusable div, never a <button>.
    <div
      role="button"
      tabIndex={0}
      className="spaces-db-menurow"
      data-active={active ? "true" : undefined}
      data-clickable=""
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {icon ? <span className="spaces-db-menuicon">{icon}</span> : null}
      <span className="flex-1 truncate text-left">{label}</span>
      {end}
    </div>
  );
}

export function FieldList<F extends { key: string; label: string }>({ fields, value, onPick, filter }: { fields: F[]; value?: string | null; onPick: (key: string) => void; filter?: (f: F) => boolean }) {
  return (
    <div className="max-h-[260px] overflow-y-auto">
      {fields.filter(filter ?? (() => true)).map((f) => (
        <MenuRow key={f.key} label={f.label} active={f.key === value} onClick={() => onPick(f.key)} />
      ))}
    </div>
  );
}

export type ViewSort = { field: string; direction: "asc" | "desc" };
/** A viewer's own sort for one view: `undefined` follows the saved sort; `null` = "no sort" for them. */
export type SortChoice = ViewSort | null | undefined;

/** The sort a view is drawn with: the viewer's choice when they made one, else the view's saved sort. */
export function shownSorts(view: SpaceDbView, choice: SortChoice): ViewSort[] {
  if (choice === undefined) return view.sorts ?? [];
  return choice ? [choice] : [];
}

/**
 * The toolbar sort (Notion): anyone may sort, it applies at once, and it is that viewer's alone — never
 * written to the view. A person who may edit the view sees "Save to view" and "Reset" once their sort
 * differs from the saved one; everyone else sees "Reset".
 */
export function ViewerSortButton({
  view,
  fields,
  choice,
  onChoice,
  canSave,
  onSave,
  icon,
}: {
  view: SpaceDbView;
  fields: Array<{ key: string; label: string }>;
  choice: SortChoice;
  onChoice: (next: SortChoice) => void;
  canSave: boolean;
  onSave: (sorts: ViewSort[]) => void;
  icon: ReactNode;
}) {
  const saved = view.sorts?.[0] ?? null;
  const sort = choice === undefined ? saved : choice;
  const differs = choice !== undefined && JSON.stringify(choice) !== JSON.stringify(saved);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" icon={icon} aria-label="Sort" title="Sort" data-on={sort ? "true" : undefined} />
      </PopoverTrigger>
      <PopoverContent surface="solid" align="end" width="md" padding="xs">
        {sort ? (
          <div className="flex items-center gap-1 p-1 type-body">
            <span className="flex-1 truncate">{fields.find((f) => f.key === sort.field)?.label ?? sort.field}</span>
            <Button variant="outline" onClick={() => onChoice({ field: sort.field, direction: sort.direction === "asc" ? "desc" : "asc" })}>
              {sort.direction === "asc" ? "Ascending" : "Descending"}
            </Button>
            <Button variant="quiet" icon={<X size={14} />} aria-label="Remove sort" onClick={() => onChoice(null)} />
          </div>
        ) : (
          <FieldList fields={fields} onPick={(key) => onChoice({ field: key, direction: "asc" })} />
        )}
        {differs ? (
          <div className="flex items-center justify-end gap-1 border-t border-border p-1">
            <Button variant="quiet" onClick={() => onChoice(undefined)}>
              Reset
            </Button>
            {canSave ? (
              <Button
                variant="primary"
                onClick={() => {
                  onSave(choice ? [choice] : []);
                  onChoice(undefined);
                }}
              >
                Save to view
              </Button>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
