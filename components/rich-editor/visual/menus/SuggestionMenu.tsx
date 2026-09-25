"use client";

// components/rich-editor/visual/menus/SuggestionMenu.tsx
//
// The one popup list behind the "/" menu and the "{{" variable menu: keyboard
// first (↑ ↓ Enter Tab Escape), grouped, touch-sized rows on phones, and
// honest when nothing matches. Positioned by the suggestion plugin's own
// Floating UI mount, rendered through Tiptap's ReactRenderer.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentType } from "react";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { cn } from "@/lib/utils";

export interface MenuItem {
  id: string;
  title: string;
  description?: string;
  group?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Right-aligned hint (a shortcut, a type). */
  hint?: string;
}

export interface SuggestionListHandle {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface SuggestionListProps {
  items: MenuItem[];
  command: (item: MenuItem) => void;
  emptyText: string;
  label: string;
  /** With nothing to pick, Enter still belongs to the menu (a half-typed `{{name`). */
  holdEnterWhenEmpty: boolean;
}

export const SuggestionList = forwardRef<SuggestionListHandle, SuggestionListProps>(
  function SuggestionList({ items, command, emptyText, label, holdEnterWhenEmpty }, ref) {
    const [active, setActive] = useState(0);
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => setActive(0), [items]);
    useEffect(() => {
      list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
    }, [active]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (!items.length) return holdEnterWhenEmpty && event.key === "Enter";
        if (event.key === "ArrowDown") {
          setActive((index) => (index + 1) % items.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          setActive((index) => (index + items.length - 1) % items.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          const item = items[active];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    let lastGroup: string | undefined;
    return (
      <div
        ref={list}
        role="listbox"
        aria-label={label}
        className="matrx-touch-targets z-50 max-h-[min(22rem,60dvh)] w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      >
        {items.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</div>}
        {items.map((item, index) => {
          const Icon = item.icon;
          const header = item.group && item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.id}>
              {header && (
                <div className="px-2 pb-0.5 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {header}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                data-index={index}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  index === active ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                )}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  command(item);
                }}
              >
                {Icon && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-background">
                    <Icon className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.title}</span>
                  {item.description && (
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  )}
                </span>
                {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
              </button>
            </div>
          );
        })}
      </div>
    );
  },
);

/** The suggestion plugin's render() — one popup per active menu. */
export function suggestionRenderer(options: { emptyText: string; label: string; holdEnterWhenEmpty?: boolean }) {
  return () => {
    let renderer: ReactRenderer<SuggestionListHandle, SuggestionListProps> | null = null;
    let unmount: (() => void) | null = null;
    const toProps = (props: SuggestionProps<MenuItem, MenuItem>): SuggestionListProps => ({
      items: props.items,
      command: props.command,
      emptyText: options.emptyText,
      label: options.label,
      holdEnterWhenEmpty: options.holdEnterWhenEmpty ?? true,
    });
    return {
      onStart: (props: SuggestionProps<MenuItem, MenuItem>) => {
        renderer = new ReactRenderer(SuggestionList, { props: toProps(props), editor: props.editor });
        unmount = props.mount(renderer.element as HTMLElement);
      },
      onUpdate: (props: SuggestionProps<MenuItem, MenuItem>) => {
        renderer?.updateProps(toProps(props));
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === "Escape") {
          unmount?.();
          unmount = null;
          return true;
        }
        return renderer?.ref?.onKeyDown(props) ?? false;
      },
      onExit: () => {
        unmount?.();
        unmount = null;
        renderer?.destroy();
        renderer = null;
      },
    };
  };
}
