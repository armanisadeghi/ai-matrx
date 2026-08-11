import React, { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { BsChevronBarContract, BsChevronBarExpand } from "react-icons/bs";
import { cn } from "@/styles/themes/utils";

interface StickyButtonsProps {
  linesCount: number;
  isCollapsed: boolean;
  isCopied: boolean;
  handleCopy: (e: React.MouseEvent) => void;
  toggleCollapse?: (e?: React.MouseEvent) => void;
}

/**
 * Quick Collapse/Copy toolbar shown once the code block's own header has
 * scrolled away. It is `position: sticky` inside the code block, so it pins to
 * the top of whatever scroll container the block lives in (page, chat message
 * list, window panel) — never to the viewport. A viewport-`fixed` toolbar
 * parked itself over the (core) shell header from any scrolled panel (D153).
 *
 * The outer box is zero-height so it consumes no layout space; the buttons
 * hang inside it absolutely. Sticky stops at the code block's bottom edge
 * because the block is the sticky element's containing block.
 *
 * One offset is needed: `.shell-main` is pulled up by `-(--shell-header-h)` so
 * (core) route content scrolls BEHIND the transparent glass header, which means
 * its top edge is under the header rather than below it. When — and only when —
 * that is our scroll container, inset by the header height. Every other
 * scroller (chat list, window panel, any in-page pane) starts where it looks
 * like it starts, so it gets `top: 0`. Resolved once on mount; nothing here
 * measures a rect or listens for resize.
 */
const StickyButtons: React.FC<StickyButtonsProps> = ({
  linesCount,
  isCollapsed,
  isCopied,
  handleCopy,
  toggleCollapse,
}) => {
  const canCollapse = linesCount > 5;
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollsBehindShellHeader, setScrollsBehindShellHeader] =
    useState(false);

  useEffect(() => {
    let node = rootRef.current?.parentElement ?? null;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") {
        setScrollsBehindShellHeader(node.classList.contains("shell-main"));
        return;
      }
      node = node.parentElement;
    }
    setScrollsBehindShellHeader(false);
  }, []);

  const buttonClass = cn(
    "py-2 px-3 rounded-lg bg-zinc-300 dark:bg-zinc-700",
    "text-neutral-700 dark:text-neutral-300",
    "hover:text-neutral-900 dark:hover:text-neutral-100",
    "hover:bg-zinc-200 dark:hover:bg-zinc-600",
    "transition-colors shadow-sm backdrop-blur-sm",
    "flex items-center gap-1 text-xs"
  );

  return (
    <div
      ref={rootRef}
      className="sticky z-20 h-0"
      style={{
        top: scrollsBehindShellHeader ? "var(--shell-header-h, 2.5rem)" : 0,
      }}
    >
      <div className="absolute right-2 top-2 flex items-center space-x-2">
        {canCollapse && toggleCollapse && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(e);
            }}
            className={buttonClass}
            title={isCollapsed ? "Expand code" : "Collapse code"}
          >
            {isCollapsed ? <BsChevronBarExpand size={16} /> : <BsChevronBarContract size={16} />}
            <span>{isCollapsed ? "Expand" : "Collapse"}</span>
          </button>
        )}

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(e);
          }}
          className={buttonClass}
          title={isCopied ? "Copied!" : "Copy code"}
        >
          {isCopied ? <Check size={16} /> : <Copy size={16} />}
          <span>Copy</span>
        </button>
      </div>
    </div>
  );
};

export default StickyButtons;
