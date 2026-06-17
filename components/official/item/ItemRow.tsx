"use client";

/**
 * ItemRow — the reusable list row.
 *
 * - Full-width label with a right-edge mask fade (NO ellipsis) that deepens on
 *   hover/focus/menu-open to clear the kebab (see `.item-row`/`.item-fade` in
 *   app/globals.css). Trailing indicators glide left in sync.
 * - Kebab is an absolute sibling (reserves no layout space) revealed on
 *   hover/focus/menu-open, and always visible on touch.
 * - Right-click opens the SAME menu config (ItemContextMenu), disabled on touch.
 * - Inline rename: double-click the row, or a menu entry with `intent: "rename"`
 *   (ItemRow swaps that entry's action for its own edit state and wins the
 *   focus race via onCloseAutoFocus).
 *
 * The menu/rename schema lives in ./types; menus render via ./ItemMenu.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { EditableLabel } from "./EditableLabel";
import { ItemMenu, ItemContextMenu } from "./ItemMenu";
import {
  isCommand,
  isSubmenu,
  resolveItemMenuConfig,
  type ItemMenuConfig,
  type ItemMenuConfigInput,
  type ItemMenuEntry,
  type ItemMenuSection,
  type ItemRowProps,
  type ItemRowSize,
} from "./types";

const SIZE: Record<
  ItemRowSize,
  { row: string; text: string; kebab: string; icon: string }
> = {
  sm: {
    row: "h-7",
    text: "text-[13px]",
    kebab: "h-5 w-5",
    icon: "h-3.5 w-3.5",
  },
  md: { row: "h-8", text: "text-sm", kebab: "h-6 w-6", icon: "h-4 w-4" },
  lg: { row: "h-10", text: "text-sm", kebab: "h-7 w-7", icon: "h-4 w-4" },
};

/** Replace `intent: "rename"` command actions with the host's rename trigger. */
function mapRenameIntent(
  config: ItemMenuConfig,
  requestRename: () => void,
): ItemMenuConfig {
  const mapEntry = (entry: ItemMenuEntry): ItemMenuEntry => {
    if (isSubmenu(entry)) {
      return { ...entry, sections: entry.sections.map(mapSection) };
    }
    if (isCommand(entry) && entry.intent === "rename") {
      return { ...entry, onSelect: requestRename };
    }
    return entry;
  };
  const mapSection = (section: ItemMenuSection): ItemMenuSection => ({
    ...section,
    items: section.items.map(mapEntry),
  });
  return { ...config, sections: config.sections.map(mapSection) };
}

export function ItemRow({
  label,
  secondaryLabel,
  leading,
  trailing,
  active = false,
  disabled = false,
  href,
  onOpen,
  menu,
  rename,
  size = "md",
  indent,
  kebabAriaLabel,
  className,
}: ItemRowProps) {
  const isMobile = useIsMobile();
  const [editing, setEditing] = useState(false);
  const pendingRenameRef = useRef(false);
  const sz = SIZE[size];

  const canRename = !!rename;
  const allowDoubleClick = canRename && rename.doubleClick !== false;

  // Wrap the menu so rename-intent entries drive ItemRow's edit state, and so
  // a static config is still resolved lazily (on open).
  const mappedMenu: ItemMenuConfigInput | undefined = menu
    ? () =>
        mapRenameIntent(resolveItemMenuConfig(menu), () => {
          pendingRenameRef.current = true;
        })
    : undefined;

  // Radix returns focus to the trigger on close; when a rename was requested,
  // intercept it and move focus into the input instead (no focus tug-of-war).
  const handleCloseAutoFocus = (event: Event) => {
    if (pendingRenameRef.current) {
      pendingRenameRef.current = false;
      event.preventDefault();
      setEditing(true);
    }
  };

  const startInlineRename = () => {
    if (canRename) setEditing(true);
  };

  const labelNode =
    editing && rename ? (
      <EditableLabel
        activation="controlled"
        editing
        onEditingChange={(next) => setEditing(next)}
        value={rename.value ?? label}
        onCommit={rename.onCommit}
        validate={rename.validate}
        emptyFallback={rename.emptyFallback}
        maxLength={rename.maxLength}
        ariaLabel="Name"
        className="flex-1"
        inputClassName={cn("font-normal", sz.text)}
      />
    ) : (
      <span className={cn("item-fade min-w-0 flex-1", sz.text)} title={label}>
        {label}
      </span>
    );

  const primaryInner = (
    <>
      {leading != null && (
        <span className="flex shrink-0 items-center">{leading}</span>
      )}
      {labelNode}
      {secondaryLabel && (
        <span className="item-shift shrink-0 text-xs text-muted-foreground">
          {secondaryLabel}
        </span>
      )}
      {trailing != null && (
        <span className="item-shift flex shrink-0 items-center gap-1 pr-0.5">
          {trailing}
        </span>
      )}
    </>
  );

  const primaryClass = cn(
    "flex w-full min-w-0 items-center gap-1.5 rounded-lg px-2",
    sz.row,
    sz.text,
    "outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
    active ? "text-foreground" : "text-foreground/90",
  );

  const indentStyle =
    indent && indent > 0 ? { paddingInlineStart: 8 + indent * 16 } : undefined;

  // Primary element: link (navigation), button (click), or div (editing/disabled).
  let primary: React.ReactNode;
  if (editing || disabled) {
    primary = (
      <div className={primaryClass} style={indentStyle}>
        {primaryInner}
      </div>
    );
  } else if (href) {
    primary = (
      <Link
        href={href}
        className={primaryClass}
        style={indentStyle}
        onClick={(e) => {
          // Modifier / middle-click: native <a> opens a new tab/window.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
          onOpen?.();
          // When `onOpen` is set it is for side effects only (close a popover,
          // etc.) — navigation stays on the Link href.
        }}
        onDoubleClick={
          allowDoubleClick
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                startInlineRename();
              }
            : undefined
        }
      >
        {primaryInner}
      </Link>
    );
  } else {
    primary = (
      <button
        type="button"
        className={cn(primaryClass, "cursor-pointer text-left")}
        style={indentStyle}
        onClick={onOpen}
        onDoubleClick={
          allowDoubleClick
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                startInlineRename();
              }
            : undefined
        }
      >
        {primaryInner}
      </button>
    );
  }

  const row = (
    <div
      data-active={active || undefined}
      className={cn(
        "item-row group/item relative rounded-lg transition-colors",
        !active && "hover:bg-accent/60",
        active && "bg-accent",
        className,
      )}
    >
      {primary}

      {mappedMenu && !editing && (
        <ItemMenu
          config={mappedMenu}
          align="end"
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <button
            type="button"
            aria-label={kebabAriaLabel ?? `Options for ${label}`}
            aria-haspopup="menu"
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute right-1 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-md",
              sz.kebab,
              "text-muted-foreground hover:bg-background hover:text-foreground",
              "opacity-0 transition-opacity",
              "group-hover/item:opacity-100 group-focus-within/item:opacity-100",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "data-[state=open]:opacity-100",
              "[@media(pointer:coarse)]:opacity-100",
            )}
          >
            <MoreHorizontal className={sz.icon} />
          </button>
        </ItemMenu>
      )}
    </div>
  );

  if (!mappedMenu) return row;

  return (
    <ItemContextMenu
      config={mappedMenu}
      enabled={!isMobile && !editing}
      onCloseAutoFocus={handleCloseAutoFocus}
    >
      {row}
    </ItemContextMenu>
  );
}
