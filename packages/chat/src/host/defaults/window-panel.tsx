"use client";

/**
 * The package's own floating-window default (CPM-009c, slice P18): what a bare
 * host (no app window manager registered through `registerChatUi({ WindowPanel })`)
 * draws for every chat window — one fixed card with a title bar and a close
 * button. matrx-frontend registers its window manager's WindowPanel instead,
 * which adds drag, resize, tray, popout and `panels=` restore.
 */

import { useState, type CSSProperties, type ReactNode } from "react";

export interface DefaultWindowPanelProps {
  id?: string;
  title?: string;
  titleNode?: ReactNode;
  onClose?: () => void;
  width?: number | string;
  height?: number | string;
  minWidth?: number;
  minHeight?: number;
  actionsRight?: ReactNode;
  sidebar?: ReactNode;
  bodyClassName?: string;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  children?: ReactNode;
  [extra: string]: unknown;
}

export function DefaultWindowPanel({
  title,
  titleNode,
  onClose,
  width = 640,
  height = 480,
  minWidth,
  minHeight,
  actionsRight,
  sidebar,
  bodyClassName,
  footerLeft,
  footerRight,
  children,
}: DefaultWindowPanelProps) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const style: CSSProperties = {
    position: "fixed",
    top: 80,
    left: 80,
    zIndex: 60,
    width,
    height,
    minWidth,
    minHeight,
    maxWidth: "calc(100vw - 16px)",
    maxHeight: "calc(100vh - 16px)",
  };
  return (
    <div
      role="dialog"
      aria-label={title}
      data-chat-slot-fallback="WindowPanel"
      style={style}
      className="flex flex-col overflow-hidden rounded-lg border bg-background shadow-xl"
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5 text-sm font-medium">
        <div className="min-w-0 truncate">{titleNode ?? title}</div>
        <div className="flex items-center gap-1">
          {actionsRight}
          <button
            type="button"
            aria-label="Close"
            className="px-1.5"
            onClick={() => {
              setOpen(false);
              onClose?.();
            }}
          >
            ×
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {sidebar ? <div className="w-56 shrink-0 overflow-auto border-r">{sidebar}</div> : null}
        <div className={`min-h-0 min-w-0 flex-1 overflow-auto ${bodyClassName ?? ""}`}>{children}</div>
      </div>
      {footerLeft || footerRight ? (
        <div className="flex items-center justify-between border-t px-3 py-1.5">
          <div>{footerLeft}</div>
          <div>{footerRight}</div>
        </div>
      ) : null}
    </div>
  );
}

export interface DefaultTabDefinition {
  id: string;
  label: ReactNode;
  content: ReactNode;
  className?: string;
}

export interface DefaultFullScreenOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  tabs: DefaultTabDefinition[];
  initialTab?: string;
  onTabChange?: (id: string) => void;
  [extra: string]: unknown;
}

/** A bare host's full-screen tabbed overlay: a fixed sheet over the page with one tab bar. */
export function DefaultFullScreenOverlay({
  isOpen,
  onClose,
  title,
  tabs,
  initialTab,
  onTabChange,
}: DefaultFullScreenOverlayProps) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.id);
  if (!isOpen) return null;
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div
      role="dialog"
      aria-label={title}
      data-chat-slot-fallback="FullScreenOverlay"
      className="fixed inset-0 z-[70] flex flex-col bg-background"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <span className="font-medium">{title}</span>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === current?.id ? "font-medium underline" : "text-muted-foreground"}
            onClick={() => {
              setActive(t.id);
              onTabChange?.(t.id);
            }}
          >
            {t.label}
          </button>
        ))}
        <button type="button" aria-label="Close" className="ml-auto px-1.5" onClick={onClose}>
          ×
        </button>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto ${current?.className ?? ""}`}>{current?.content}</div>
    </div>
  );
}
