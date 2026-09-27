"use client";

/**
 * The workspace's properties panel — 250px, tabs across the top, each tab's
 * content in its own scroll box. Lists scroll with a FADE at the bottom edge
 * (never a hard clip) and the scrollbar stays invisible until the box is
 * hovered. The fade hides itself once the list is scrolled to its end, so the
 * last row is never dimmed.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CanvasPropertiesTab {
  id: string;
  label: string;
  content: ReactNode;
}

export const CANVAS_PROPERTIES_WIDTH_PX = 250;

export function CanvasPropertiesPanel({
  tabs,
  variant = "panel",
  className,
}: {
  tabs: readonly CanvasPropertiesTab[];
  /** `sheet` = inside the mobile bottom sheet (full width, no left border). */
  variant?: "panel" | "sheet";
  className?: string;
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? "");
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <aside
      aria-label="Properties"
      style={variant === "panel" ? { width: CANVAS_PROPERTIES_WIDTH_PX } : undefined}
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col bg-background px-2.5 pt-1.5",
        variant === "panel" && "border-l border-border",
        className,
      )}
    >
      <div role="tablist" aria-label="Properties tabs" className="flex shrink-0 gap-2.5 border-b border-border">
        {tabs.map((tab) => {
          const on = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActiveId(tab.id)}
              className={cn(
                "-mb-px border-b-2 px-1 py-1.5 text-[13px] transition-colors",
                on
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <FadingScroll key={active.id} className="min-h-0 flex-1">
          {active.content}
        </FadingScroll>
      ) : null}
    </aside>
  );
}

/** A scroll box whose bottom edge fades while there is more below. */
export function FadingScroll({ children, className }: { children: ReactNode; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const measure = () => setMoreBelow(box.scrollHeight - box.scrollTop - box.clientHeight > 1);
    measure();
    box.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={boxRef}
        // The scrollbar is invisible until hovered — the shell's own rule for
        // every scroll box under `.shell-main` (styles/shell.css, "Ultra-thin
        // auto-hiding scrollbar"), which this page keeps.
        className="h-full overflow-y-auto py-1.5"
      >
        <div>{children}</div>
      </div>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 h-11 bg-gradient-to-b from-transparent to-background transition-opacity duration-150",
          moreBelow ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
