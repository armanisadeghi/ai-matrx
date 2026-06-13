"use client";

/**
 * ItemMenu / ItemContextMenu — schema-driven menus rendered three ways from one
 * ItemMenuConfig:
 *   - desktop dropdown  (kebab trigger)      → Radix DropdownMenu, modal={false}
 *   - right-click       (wraps a surface)    → Radix ContextMenu, modal={false}
 *   - mobile            (either trigger)     → Vaul bottom drawer w/ drill-in
 *
 * There is NO dimming backdrop, ever (modal={false} on both desktop roots).
 * Desktop dropdown + context-menu share ONE recursive renderer over a Radix
 * "family" adapter, so the two presentations cannot drift. Async command
 * actions run synchronously in the select handler (preserving the user-gesture
 * needed for clipboard), then sonner carries any feedback via `toast.promise`.
 */

import { Fragment, useState, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { toast } from "sonner";
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
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuSeparator,
  ContextMenuLabel,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import { ItemMenuDrawer } from "./ItemMenuDrawer";
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

// Context submenu content defaults to z-50 in the ui wrapper — force z-[9999]
// so submenus opened inside floating WindowPanels (z >= 1000) layer above.
const ContextSubContentZ: MenuFamily["SubContent"] = ({ className, ...props }) => (
  <ContextMenuSubContent className={cn("z-[9999]", className)} {...props} />
);

const contextFamily: MenuFamily = {
  Item: ContextMenuItem,
  CheckboxItem: ContextMenuCheckboxItem,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextSubContentZ,
  Separator: ContextMenuSeparator,
  Label: ContextMenuLabel,
  Shortcut: ContextMenuShortcut,
};

const DESTRUCTIVE_ITEM_CLASS =
  "text-destructive focus:bg-destructive/10 focus:text-destructive [&_svg]:text-destructive";

// ── Action dispatch ─────────────────────────────────────────────────────────

function runCommand(entry: ItemMenuCommand) {
  const result = entry.onSelect();
  if (result instanceof Promise) {
    if (entry.toast) {
      const { loading, success, error } = entry.toast;
      toast.promise(result, {
        loading,
        success,
        error: (e) =>
          typeof error === "function" ? error(e) : (error ?? "Something went wrong"),
      });
    } else {
      result.catch(() => {});
    }
  }
}

function runToggle(entry: ItemMenuCheckbox, next: boolean) {
  const result = entry.onCheckedChange(next);
  if (result instanceof Promise) result.catch(() => {});
}

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
          style={{ minWidth: contentMinWidth }}
          onCloseAutoFocus={onCloseAutoFocus}
          onKeyDown={makeShortcutHandler(resolved, () => handleOpenChange(false))}
        >
          {resolved.header?.title && (
            <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
              {resolved.header.title}
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

export function ItemContextMenu({
  config,
  children,
  onOpenChange,
  onCloseAutoFocus,
  enabled = true,
}: ItemContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<ItemMenuConfig | null>(null);

  if (!enabled) return <>{children}</>;

  const handleOpenChange = (next: boolean) => {
    if (next) setResolved(resolveItemMenuConfig(config));
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <ContextMenu modal={false} onOpenChange={handleOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {resolved && (
        <ContextMenuContent
          className="z-[9999]"
          onCloseAutoFocus={onCloseAutoFocus}
          onKeyDown={makeShortcutHandler(resolved, () => setOpen(false))}
        >
          {resolved.header?.title && (
            <ContextMenuLabel>{resolved.header.title}</ContextMenuLabel>
          )}
          <MenuSections
            family={contextFamily}
            sections={resolved.sections}
            onCloseRequest={() => setOpen(false)}
          />
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}
