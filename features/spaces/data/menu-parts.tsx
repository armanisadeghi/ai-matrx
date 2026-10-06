"use client";

// features/spaces/data/menu-parts.tsx — the small pieces every database block's toolbar shares: a view
// tab (rename / duplicate / delete), a menu row, a field list.

import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button, Input } from "@ai-matrx/design-system/controls";
import { Copy, Trash2 } from "lucide-react";
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
