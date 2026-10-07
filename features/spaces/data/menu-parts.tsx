"use client";

// features/spaces/data/menu-parts.tsx — the small pieces every database block's toolbar shares: a view
// tab (rename / duplicate / delete), a menu row, a field list.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Input } from "@ai-matrx/design-system/controls";
import { ChevronDown, Copy, FileText, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
        {pill || active ? (
          // A chart tile's title is the tile's own layout (Notion's grey pill), not a toolbar control;
          // the open view of a table sits in the same grey pill (screenshot 1's "All").
          <button type="button" className={pill ? "spaces-chart-title" : "spaces-chart-title spaces-view-pill"} role="tab" aria-selected={active} title={view.name}>
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

/** A viewer's own filters for one view: `undefined` follows the saved filters. */
export type FilterChoice = SpaceDbView["filters"] | undefined;
type Filters = NonNullable<SpaceDbView["filters"]>;

/** The filters a view is drawn with: the viewer's own when they changed them, else the view's saved ones. */
export function shownFilters(view: SpaceDbView, choice: FilterChoice): Filters {
  return choice === undefined ? (view.filters ?? {}) : choice;
}

/** True when the viewer's filters differ from the view's saved ones. */
export function filtersDiffer(view: SpaceDbView, choice: FilterChoice): boolean {
  return choice !== undefined && JSON.stringify(choice) !== JSON.stringify(view.filters ?? {});
}

/**
 * Notion's footer under a changed filter or sort: "Reset" for everyone, "Save for everyone" for a person
 * who may edit the view. Until then the change is the viewer's alone.
 */
export function ViewerSaveBar({ canSave, onReset, onSave }: { canSave: boolean; onReset: () => void; onSave: () => void }) {
  return (
    <div className="flex items-center justify-end gap-1 border-t border-border p-1">
      <Button variant="quiet" onClick={onReset}>
        Reset
      </Button>
      {canSave ? (
        <Button variant="primary" onClick={onSave}>
          Save for everyone
        </Button>
      ) : null}
    </div>
  );
}

/**
 * The toolbar sort (Notion): anyone may sort, it applies at once, and it is that viewer's alone — never
 * written to the view. A person who may edit the view sees "Save for everyone" and "Reset" once their sort
 * differs from the saved one; everyone else sees "Reset". The toolbar filter behaves the same way.
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
          <ViewerSaveBar
            canSave={canSave}
            onReset={() => onChoice(undefined)}
            onSave={() => {
              onSave(choice ? [choice] : []);
              onChoice(undefined);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

/** An open menu, popover or dialog owns Esc first (Radix closes it); the peek waits for the next Esc. */
function layerOpen(): boolean {
  return Boolean(document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="menu"], [role="listbox"]'));
}

/**
 * Notion's side peek: a panel on the right with a close button; Esc closes it. The database host stops
 * key events from reaching the page natively, so Esc is heard on the window in the capture phase.
 */
export function SidePeek({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || layerOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <aside className="spaces-peek-side" aria-label="Side peek">
      <div className="spaces-peek-bar">
        <Button variant="quiet" icon={<X size={16} />} aria-label="Close" onClick={onClose} />
      </div>
      <div className="spaces-peek-body">{children}</div>
    </aside>
  );
}

/** Notion's blue "New" in a database toolbar: a new row in place, and the template chevron. */
export function NewButton({ onNew }: { onNew: () => void }) {
  return (
    <div className="spaces-db-new">
      <Button variant="quiet" onClick={onNew}>
        New
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="quiet" icon={<ChevronDown size={14} />} aria-label="Templates" />
        </PopoverTrigger>
        <PopoverContent surface="solid" align="end" width="sm" padding="xs">
          <div className="px-2 py-1 type-secondary text-muted-foreground">Templates</div>
          <MenuRow icon={<FileText size={15} />} label="Empty page" onClick={onNew} />
        </PopoverContent>
      </Popover>
    </div>
  );
}
