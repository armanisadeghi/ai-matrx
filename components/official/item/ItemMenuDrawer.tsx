"use client";

/**
 * ItemMenuDrawer — mobile presentation for ItemMenu.
 *
 * A Vaul bottom sheet with iOS-style submenu drill-in: tapping a submenu pushes
 * a new view (slide-in-from-right), the back button pops it (slide-in-from-left).
 * Renders the same ItemMenuConfig the desktop dropdown/context menu use.
 *
 * Used internally by ItemMenu — not exported as a standalone primitive.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  isCheckbox,
  isCommand,
  isLink,
  isSubmenu,
  type ItemMenuConfig,
  type ItemMenuEntry,
  type ItemMenuSection,
} from "./types";

interface ItemMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ItemMenuConfig;
  /** Runs a command entry (close-then-execute is handled by the caller). */
  onCommand: (entry: ItemMenuEntry) => void;
  /** Toggles a checkbox entry without closing the drawer. */
  onToggle: (entry: ItemMenuEntry, next: boolean) => void;
}

/** Walk a submenu `path` (entry ids) to the sections it points at. */
function resolveSections(
  config: ItemMenuConfig,
  path: string[],
): { sections: ItemMenuSection[]; title: string | null } {
  let sections = config.sections;
  let title: string | null = null;
  for (const id of path) {
    const found = sections
      .flatMap((s) => s.items)
      .find((e) => e.id === id && isSubmenu(e));
    if (found && isSubmenu(found)) {
      sections = found.sections;
      title = found.label;
    } else {
      // Unknown id — defensively reset to root.
      return { sections: config.sections, title: null };
    }
  }
  return { sections, title };
}

export function ItemMenuDrawer({
  open,
  onOpenChange,
  config,
  onCommand,
  onToggle,
}: ItemMenuDrawerProps) {
  const [path, setPath] = useState<string[]>([]);
  const [direction, setDirection] = useState<"push" | "pop">("push");

  const { sections, title } = resolveSections(config, path);
  const atRoot = path.length === 0;
  const headerTitle = atRoot ? config.header?.title : title;

  const push = (id: string) => {
    setDirection("push");
    setPath((p) => [...p, id]);
  };
  const pop = () => {
    setDirection("pop");
    setPath((p) => p.slice(0, -1));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setPath([]);
    onOpenChange(next);
  };

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="max-h-[80dvh] flex flex-col">
        {/* Header — Back button when drilled in. DrawerTitle always present. */}
        {atRoot ? (
          headerTitle ? (
            <div className="flex-shrink-0 border-b border-border px-4 pb-3 pt-1">
              <DrawerTitle className="text-center text-[15px] font-semibold">
                {headerTitle}
              </DrawerTitle>
              {config.header?.description && (
                <p className="mt-1 text-center text-[13px] text-muted-foreground">
                  {config.header.description}
                </p>
              )}
            </div>
          ) : (
            <DrawerTitle className="sr-only">Options</DrawerTitle>
          )
        ) : (
          <div className="flex h-11 flex-shrink-0 items-center border-b border-border px-1">
            <button
              type="button"
              onClick={pop}
              aria-label="Back"
              className="flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <DrawerTitle className="flex-1 truncate pr-10 text-center text-[15px] font-semibold">
              {headerTitle ?? "Options"}
            </DrawerTitle>
          </div>
        )}

        {/* Body — keyed by path so each view animates in. */}
        <div
          key={path.join("/")}
          className={cn(
            "flex-1 overflow-y-auto overscroll-contain py-2 pb-safe",
            direction === "push"
              ? "animate-in fade-in slide-in-from-right-8 duration-200"
              : "animate-in fade-in slide-in-from-left-8 duration-200",
          )}
        >
          {sections.map((section, sIdx) => {
            const visible = section.items.filter((e) => !e.hidden);
            if (visible.length === 0) return null;
            return (
              <div key={section.id ?? section.label ?? sIdx}>
                {sIdx > 0 && <div className="my-1 h-px bg-border" />}
                {section.label && (
                  <div className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </div>
                )}
                {visible.map((entry) => (
                  <DrawerEntry
                    key={entry.id}
                    entry={entry}
                    onCommand={onCommand}
                    onToggle={onToggle}
                    onDrill={() => push(entry.id)}
                    onClose={() => handleOpenChange(false)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface DrawerEntryProps {
  entry: ItemMenuEntry;
  onCommand: (entry: ItemMenuEntry) => void;
  onToggle: (entry: ItemMenuEntry, next: boolean) => void;
  onDrill: () => void;
  onClose: () => void;
}

function DrawerEntry({
  entry,
  onCommand,
  onToggle,
  onDrill,
  onClose,
}: DrawerEntryProps) {
  const Icon = entry.icon;
  const destructive = isCommand(entry) && entry.tone === "destructive";
  const disabled = entry.disabled;

  const rowClass = cn(
    "flex min-h-12 w-full items-center gap-3 px-4 text-left",
    disabled
      ? "opacity-50"
      : "active:bg-accent",
    destructive && "text-destructive",
  );

  const content = (
    <>
      {Icon && (
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0",
            destructive
              ? "text-destructive"
              : entry.iconClassName ?? "text-muted-foreground",
          )}
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px]">{entry.label}</span>
        {(entry.description || (disabled && entry.disabledReason)) && (
          <span className="truncate text-[13px] text-muted-foreground">
            {disabled && entry.disabledReason
              ? entry.disabledReason
              : entry.description}
          </span>
        )}
      </span>
    </>
  );

  if (isSubmenu(entry)) {
    return (
      <button type="button" disabled={disabled} onClick={onDrill} className={rowClass}>
        {content}
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  if (isCheckbox(entry)) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onToggle(entry, !entry.checked)}
        className={rowClass}
      >
        {content}
        {entry.checked && <Check className="h-5 w-5 shrink-0 text-primary" />}
      </button>
    );
  }

  if (isLink(entry)) {
    return (
      <a
        href={entry.href}
        target={entry.target}
        rel={entry.target === "_blank" ? "noopener noreferrer" : undefined}
        onClick={onClose}
        className={rowClass}
      >
        {content}
      </a>
    );
  }

  // command
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        onClose();
        onCommand(entry);
      }}
      className={rowClass}
    >
      {content}
    </button>
  );
}
