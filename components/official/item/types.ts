/**
 * Item system — shared schema + prop types for ItemRow, ItemMenu, EditableLabel.
 *
 * Pure types (no JSX). The menu config is a structured `sections` array with a
 * discriminated union of entries (`kind`), so ordering is explicit, section
 * labels are first-class, separators fall out of section boundaries, and
 * submenus nest naturally.
 *
 * Consumed by ItemMenu.tsx, ItemMenuDrawer.tsx, ItemRow.tsx, EditableLabel.tsx.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// ── Menu entries ────────────────────────────────────────────────────────────

interface ItemMenuEntryBase {
  /** Stable identity within the menu. React key + shortcut/debug target. */
  id: string;
  label: string;
  icon?: LucideIcon;
  /**
   * Semantic color class for the icon ONLY (e.g. "text-amber-500" for a pin).
   * Destructive entries use `tone: "destructive"`, never an iconClassName.
   */
  iconClassName?: string;
  /** Muted second line under the label (desktop + drawer). Keep it short. */
  description?: string;
  /** Omit the entry entirely. Builders compute this at config-build time. */
  hidden?: boolean;
  disabled?: boolean;
  /** Why it's disabled — rendered inline (muted) and as a `title` tooltip. */
  disabledReason?: string;
}

/** Visual + semantic severity. Destructive renders text/icon in text-destructive. */
export type ItemMenuTone = "default" | "destructive";

export interface ItemMenuToast {
  loading: string;
  success: string;
  /** Static message, or derive one from the thrown error. */
  error?: string | ((error: unknown) => string);
}

/** A plain action. The default entry kind. */
export interface ItemMenuCommand extends ItemMenuEntryBase {
  kind?: "command";
  tone?: ItemMenuTone;
  /**
   * Runs synchronously in the select handler (preserves the user-gesture
   * context required by clipboard writes), then the menu closes. If it
   * returns a Promise AND `toast` is set, the promise is handed to
   * sonner's `toast.promise`. If it returns a Promise WITHOUT `toast`, it's
   * fire-and-forget (the action owns its own optimistic update + feedback —
   * the conversation-thunk pattern). Void → nothing.
   */
  onSelect: () => void | Promise<void>;
  toast?: ItemMenuToast;
  /** Display-only shortcut hint, right-aligned ("⌘D", "R"). Desktop only. */
  shortcut?: string;
  /**
   * Single character that activates this entry while the menu is open
   * (Claude Code style: P/R/A/D). Case-insensitive, no modifiers.
   */
  shortcutKey?: string;
  /**
   * Declarative hook for host components. ItemRow intercepts `"rename"` and
   * starts its inline rename INSTEAD of running `onSelect`. Standalone
   * ItemMenu ignores intent and runs `onSelect` (keep a dialog fallback
   * there for non-row surfaces).
   */
  intent?: "rename";
}

/**
 * A persistent on/off toggle (Radix CheckboxItem desktop, check glyph in the
 * drawer). Selecting it does NOT close the menu — it's a view option.
 *
 * RESERVED for genuine view options ("Show timestamps", "Compact rows").
 * State-FLIP actions (Pin/Unpin, Archive/Unarchive) stay plain `command`s
 * whose label+icon the builder swaps from current state.
 */
export interface ItemMenuCheckbox extends ItemMenuEntryBase {
  kind: "checkbox";
  checked: boolean;
  /** Should be optimistic. Failures are the caller's to toast + revert. */
  onCheckedChange: (next: boolean) => void | Promise<void>;
  shortcut?: string;
  shortcutKey?: string;
}

/** A real <a>. Gives middle-click / cmd-click semantics inside the menu. */
export interface ItemMenuLink extends ItemMenuEntryBase {
  kind: "link";
  href: string;
  /** "_blank" adds rel="noopener noreferrer" automatically. */
  target?: "_blank";
}

/** Nested submenu — Radix Sub on desktop, drill-in view on the drawer. */
export interface ItemMenuSubmenu extends ItemMenuEntryBase {
  kind: "submenu";
  /** Submenu body. Sections render with separators between them. */
  sections: ItemMenuSection[];
}

export type ItemMenuEntry =
  | ItemMenuCommand
  | ItemMenuCheckbox
  | ItemMenuLink
  | ItemMenuSubmenu;

// ── Sections + config ───────────────────────────────────────────────────────

export interface ItemMenuSection {
  /** React key. Defaults to `label` ?? index. Provide when label is absent. */
  id?: string;
  /** Optional muted heading ("Manage", "Danger"). */
  label?: string;
  items: ItemMenuEntry[];
}

export interface ItemMenuHeader {
  /** e.g. the row title. The drawer renders it as DrawerTitle. */
  title: string;
  description?: string;
}

export interface ItemMenuConfig {
  /** Optional header. Desktop renders a muted label row; drawer a real header. */
  header?: ItemMenuHeader;
  /** Separators are derived from section boundaries — never declared. */
  sections: ItemMenuSection[];
}

/**
 * Lazy form: invoked when the menu opens, so big lists don't build N configs
 * per render. Either form is accepted anywhere a config is.
 */
export type ItemMenuConfigInput = ItemMenuConfig | (() => ItemMenuConfig);

// ── ItemMenu component props ────────────────────────────────────────────────

export interface ItemMenuProps {
  config: ItemMenuConfigInput;
  /** The trigger element — rendered via Radix `asChild` (must accept a ref). */
  children: ReactNode;
  /** Dropdown alignment relative to trigger. Default "end". */
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  /** Observe open state (e.g. ItemRow pins the kebab visible while open). */
  onOpenChange?: (open: boolean) => void;
  /**
   * Radix `onCloseAutoFocus` passthrough. ItemRow uses it to move focus into
   * the rename input instead of back to the kebab. Desktop only.
   */
  onCloseAutoFocus?: (event: Event) => void;
  /** Min width of the dropdown content. Default "12rem". */
  contentMinWidth?: string;
  /** Force presentation. Default: useIsMobile(). For demos/tests. */
  presentation?: "auto" | "dropdown" | "drawer";
}

export interface ItemContextMenuProps {
  config: ItemMenuConfigInput;
  /** The right-clickable surface (usually the whole row). */
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * When false, children render bare (no Radix root). ItemRow passes `false`
   * on touch so long-press doesn't fight scroll + the always-visible kebab.
   */
  enabled?: boolean;
}

// ── EditableLabel props ─────────────────────────────────────────────────────

export type EditableLabelCommitMode = "optimistic" | "await";
export type EditableLabelActivation = "click" | "doubleClick" | "controlled";

export interface EditableLabelProps {
  value: string;
  /**
   * Commit handler. optimistic (default): edit mode exits immediately, the
   * promise is fire-and-forget (owners do optimistic update + revert + toast).
   * await: input disables with a spinner until the promise resolves; a
   * rejection keeps edit mode open to retry.
   */
  onCommit: (next: string) => void | Promise<void>;
  commitMode?: EditableLabelCommitMode;
  /** Return an error message to block the commit (shown under the input). */
  validate?: (next: string) => string | null;
  /** Used when the trimmed draft is empty. Undefined → empty cancels. */
  emptyFallback?: string;
  maxLength?: number; // default 120
  /**
   * "click"/"doubleClick" — internal edit state (headers). "controlled" — host
   * owns `editing`; EditableLabel renders ONLY the input when editing.
   */
  activation?: EditableLabelActivation;
  editing?: boolean; // controlled mode
  onEditingChange?: (editing: boolean) => void;
  selectOnEdit?: boolean; // default true
  placeholder?: string;
  /** Accessible name, e.g. "Session title". Default "Name". */
  ariaLabel?: string;
  truncate?: boolean; // display mode, default true
  className?: string; // both modes
  displayClassName?: string;
  inputClassName?: string;
}

// ── ItemRow props ───────────────────────────────────────────────────────────

export interface ItemRowRename {
  /** Text being renamed. Defaults to `label`. */
  value?: string;
  onCommit: (next: string) => void | Promise<void>;
  validate?: (next: string) => string | null;
  emptyFallback?: string;
  maxLength?: number;
  /** Allow double-click on the row to start renaming. Default true. */
  doubleClick?: boolean;
}

export type ItemRowSize = "sm" | "md" | "lg"; // h-7 / h-8 (default) / h-10

export interface ItemRowProps {
  label: string;
  /** Muted, never masked; sits between label and trailing indicators. */
  secondaryLabel?: string;
  /** Icon / status-dot slot. Fixed-width content recommended (size-4). */
  leading?: ReactNode;
  /**
   * Indicator slot (star, streaming dot). Sits at the right edge at rest and
   * glides LEFT (translate) when the kebab is revealed. Never masked.
   */
  trailing?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  /** Navigation mode — renders next/link as the row's primary element. */
  href?: string;
  /** Click mode — renders a <button> primary. Ignored while renaming. */
  onOpen?: () => void;
  /** Kebab + right-click menu. Omit for menu-less rows. */
  menu?: ItemMenuConfigInput;
  /** Inline rename. Enables double-click + the `intent: "rename"` contract. */
  rename?: ItemRowRename;
  size?: ItemRowSize; // default "md"
  /** Tree depth. padding-inline-start = 8px + indent * 16px. */
  indent?: number;
  /** Accessible label for the kebab. Default `Options for ${label}`. */
  kebabAriaLabel?: string;
  className?: string;
}

// ── Type guards ─────────────────────────────────────────────────────────────

export function isCommand(entry: ItemMenuEntry): entry is ItemMenuCommand {
  return entry.kind === undefined || entry.kind === "command";
}
export function isCheckbox(entry: ItemMenuEntry): entry is ItemMenuCheckbox {
  return entry.kind === "checkbox";
}
export function isLink(entry: ItemMenuEntry): entry is ItemMenuLink {
  return entry.kind === "link";
}
export function isSubmenu(entry: ItemMenuEntry): entry is ItemMenuSubmenu {
  return entry.kind === "submenu";
}

export function resolveItemMenuConfig(input: ItemMenuConfigInput): ItemMenuConfig {
  return typeof input === "function" ? input() : input;
}
