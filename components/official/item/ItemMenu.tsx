"use client";

/**
 * ItemMenu / ItemContextMenu — schema-driven menus rendered three ways from one
 * ItemMenuConfig:
 *   - desktop dropdown  (kebab trigger)      → Radix DropdownMenu, modal={false}
 *   - right-click       (wraps a surface)    → the UNIVERSAL v3 context menu
 *                                              (config converted to
 *                                              extraSections via itemMenuToV3)
 *   - mobile            (kebab trigger)      → Vaul bottom drawer w/ drill-in
 *
 * No dimming backdrop on the dropdown (modal={false}). Command/toggle
 * execution is shared across ALL presentations via run-entry.ts (sync-in-
 * gesture for clipboard, sonner toast.promise), so semantics cannot drift.
 */

import { Fragment, useState, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { ItemMenuDrawer } from "./ItemMenuDrawer";
import { itemMenuConfigToExtraSections } from "./itemMenuToV3";
import { runCommand, runToggle } from "./run-entry";
import {
  isCheckbox,
  isCommand,
  isLink,
  isSubmenu,
  resolveItemMenuConfig,
  type ItemContextMenuProps,
  type ItemMenuCheckbox,
  type ItemMenuCommand,
  type ItemMenuConfig,
  type ItemMenuEntry,
  type ItemMenuProps,
  type ItemMenuSection,
} from "./types";

// ── Radix family adapter ────────────────────────────────────────────────────
// One renderer, two component sets. Force z-[9999] on context content so menus
// opened inside floating WindowPanels (z >= 1000) layer above the window.

interface MenuFamily {
  Item: React.ComponentType<{
    disabled?: boolean;
    onSelect?: (event: Event) => void;
    className?: string;
    asChild?: boolean;
    children?: ReactNode;
  }>;
  CheckboxItem: React.ComponentType<{
    checked?: boolean;
    disabled?: boolean;
    onSelect?: (event: Event) => void;
    onCheckedChange?: (checked: boolean) => void;
    className?: string;
    children?: ReactNode;
  }>;
  Sub: React.ComponentType<{ children?: ReactNode }>;
  SubTrigger: React.ComponentType<{
    disabled?: boolean;
    className?: string;
    children?: ReactNode;
  }>;
  SubContent: React.ComponentType<{ className?: string; children?: ReactNode }>;
  Separator: React.ComponentType<{ className?: string }>;
  Label: React.ComponentType<{ className?: string; children?: ReactNode }>;
  Shortcut: React.ComponentType<{ className?: string; children?: ReactNode }>;
}

const dropdownFamily: MenuFamily = {
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
  Separator: DropdownMenuSeparator,
  Label: DropdownMenuLabel,
  Shortcut: DropdownMenuShortcut,
};

const DESTRUCTIVE_ITEM_CLASS =
  "text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive";

// ── Action dispatch — shared with the v3 converter (itemMenuToV3.ts) ────────
// Lives in run-entry.ts so toast.promise / fire-and-forget semantics cannot
// drift between the kebab dropdown and the universal right-click menu.

// ── Shared leaf content ─────────────────────────────────────────────────────

function EntryInner({
  entry,
  Shortcut,
  showShortcut = true,
}: {
  entry: ItemMenuEntry;
  Shortcut: MenuFamily["Shortcut"];
  showShortcut?: boolean;
}) {
  const Icon = entry.icon;
  const destructive = isCommand(entry) && entry.tone === "destructive";
  const shortcutText =
    (isCommand(entry) || isCheckbox(entry))
      ? (entry.shortcut ?? entry.shortcutKey?.toUpperCase())
      : undefined;
  const secondLine =
    entry.disabled && entry.disabledReason ? entry.disabledReason : entry.description;

  return (
    <>
      {Icon && (
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            destructive
              ? "text-destructive"
              : entry.iconClassName ?? "text-muted-foreground",
          )}
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{entry.label}</span>
        {secondLine && (
          <span className="truncate text-xs text-muted-foreground">{secondLine}</span>
        )}
      </span>
      {showShortcut && shortcutText && <Shortcut>{shortcutText}</Shortcut>}
    </>
  );
}

// ── Recursive section renderer (desktop dropdown + context) ─────────────────

function MenuSections({
  family,
  sections,
  onCloseRequest,
}: {
  family: MenuFamily;
  sections: ItemMenuSection[];
  /** Closes the menu (used by link clicks; commands close via Radix default). */
  onCloseRequest: () => void;
}) {
  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((e) => !e.hidden) }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      {visibleSections.map((section, sIdx) => (
        <Fragment key={section.id ?? section.label ?? sIdx}>
          {sIdx > 0 && <family.Separator />}
          {section.label && (
            <family.Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {section.label}
            </family.Label>
          )}
          {section.items.map((entry) => (
            <MenuLeaf
              key={entry.id}
              family={family}
              entry={entry}
              onCloseRequest={onCloseRequest}
            />
          ))}
        </Fragment>
      ))}
    </>
  );
}

function MenuLeaf({
  family,
  entry,
  onCloseRequest,
}: {
  family: MenuFamily;
  entry: ItemMenuEntry;
  onCloseRequest: () => void;
}) {
  if (isSubmenu(entry)) {
    return (
      <family.Sub>
        <family.SubTrigger disabled={entry.disabled} className="gap-2">
          <EntryInner entry={entry} Shortcut={family.Shortcut} showShortcut={false} />
        </family.SubTrigger>
        <family.SubContent>
          <MenuSections
            family={family}
            sections={entry.sections}
            onCloseRequest={onCloseRequest}
          />
        </family.SubContent>
      </family.Sub>
    );
  }

  if (isCheckbox(entry)) {
    return (
      <family.CheckboxItem
        checked={entry.checked}
        disabled={entry.disabled}
        onSelect={(e) => e.preventDefault()} // stay open
        onCheckedChange={(next) => runToggle(entry, next)}
        className="gap-2"
      >
        <EntryInner entry={entry} Shortcut={family.Shortcut} />
      </family.CheckboxItem>
    );
  }

  if (isLink(entry)) {
    return (
      <family.Item asChild disabled={entry.disabled} className="gap-2">
        <a
          href={entry.href}
          target={entry.target}
          rel={entry.target === "_blank" ? "noopener noreferrer" : undefined}
          onClick={onCloseRequest}
        >
          <EntryInner entry={entry} Shortcut={family.Shortcut} />
        </a>
      </family.Item>
    );
  }

  // command
  return (
    <family.Item
      disabled={entry.disabled}
      onSelect={() => runCommand(entry)}
      className={cn("gap-2", entry.tone === "destructive" && DESTRUCTIVE_ITEM_CLASS)}
    >
      <EntryInner entry={entry} Shortcut={family.Shortcut} />
    </family.Item>
  );
}

// ── Single-key shortcut handling ────────────────────────────────────────────

function makeShortcutHandler(
  config: ItemMenuConfig,
  close: () => void,
): (event: React.KeyboardEvent) => void {
  return (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key.length !== 1) return;
    const key = event.key.toLowerCase();
    // Top-level entries only — submenus handle their own keys when open.
    const entries = config.sections
      .flatMap((s) => s.items)
      .filter((e) => !e.hidden && !e.disabled);
    const match = entries.find(
      (e) =>
        (isCommand(e) || isCheckbox(e)) &&
        e.shortcutKey?.toLowerCase() === key,
    );
    if (!match) return;
    event.preventDefault();
    event.stopPropagation();
    if (isCheckbox(match)) {
      runToggle(match, !match.checked); // stays open
    } else if (isCommand(match)) {
      runCommand(match); // sets pendingRename etc. before close
      close();
    }
  };
}

// ── ItemMenu (trigger-anchored dropdown / drawer) ───────────────────────────

export function ItemMenu({
  config,
  children,
  align = "end",
  side,
  onOpenChange,
  onCloseAutoFocus,
  contentMinWidth = "12rem",
  presentation = "auto",
}: ItemMenuProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<ItemMenuConfig | null>(null);

  const handleOpenChange = (next: boolean) => {
    if (next) setResolved(resolveItemMenuConfig(config));
    setOpen(next);
    onOpenChange?.(next);
  };

  const mode =
    presentation === "auto" ? (isMobile ? "drawer" : "dropdown") : presentation;

  if (mode === "drawer") {
    return (
      <>
        <Slot
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            handleOpenChange(true);
          }}
        >
          {children}
        </Slot>
        {resolved && (
          <ItemMenuDrawer
            open={open}
            onOpenChange={handleOpenChange}
            config={resolved}
            onCommand={(entry) => isCommand(entry) && runCommand(entry)}
            onToggle={(entry, next) => isCheckbox(entry) && runToggle(entry, next)}
          />
        )}
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      {resolved && (
        <DropdownMenuContent
          align={align}
          side={side}
          // A rich menu (a full record-action registry is 20+ entries) is
          // taller than a short viewport. Without this the overflow is simply
          // UNREACHABLE — Radix positions the panel but does not scroll it, so
          // Delete silently falls off the bottom of the screen.
          //
          // Bound to Radix's OWN available-height var, not a vh fraction: a
          // plain `max-h-[70vh]` still overhangs, because 70vh is measured
          // against the viewport while the panel starts partway down it.
          collisionPadding={12}
          className="max-h-[min(var(--radix-dropdown-menu-content-available-height),32rem)] overflow-y-auto"
          style={{ minWidth: contentMinWidth }}
          onCloseAutoFocus={onCloseAutoFocus}
          onKeyDown={makeShortcutHandler(resolved, () => handleOpenChange(false))}
        >
          {resolved.header?.title && (
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              {resolved.header.title}
              {resolved.header.description && (
                <span className="mt-0.5 block text-[10px] font-normal text-muted-foreground/70">
                  {resolved.header.description}
                </span>
              )}
            </DropdownMenuLabel>
          )}
          <MenuSections
            family={dropdownFamily}
            sections={resolved.sections}
            onCloseRequest={() => handleOpenChange(false)}
          />
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

// ── ItemContextMenu (right-click anchored) ──────────────────────────────────
// Renders the ONE universal context menu (v3): the schema-driven config rides
// in as extraSections (converted lazily at open — resolveContextOnOpen fires
// before the menu mounts, matching the old resolve-on-open behavior), and the
// row inherits the standard extras (Copy, agents, Quick Actions, admin).
// Deliberate delta vs the old bespoke tree: in-menu single-key shortcut
// EXECUTION is gone (hints still display) — see FEATURE.md backlog note.

export function ItemContextMenu({
  config,
  children,
  onOpenChange,
  onCloseAutoFocus,
  enabled = true,
}: ItemContextMenuProps) {
  const [resolved, setResolved] = useState<ItemMenuConfig | null>(null);

  if (!enabled) return <>{children}</>;

  return (
    <NonEditableContextMenu
      sourceFeature="item-context-menu"
      resolveContextOnOpen={() => {
        // Re-resolve on every open so lazy configs stay live (parity with the
        // old handleOpenChange). The resolved config feeds extraSections on
        // the re-render this setState triggers, before MenuContent mounts.
        setResolved(resolveItemMenuConfig(config));
        return null;
      }}
      extraSections={resolved ? itemMenuConfigToExtraSections(resolved) : []}
      onMenuOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      enableFloatingIcon={false}
    >
      {children}
    </NonEditableContextMenu>
  );
}
