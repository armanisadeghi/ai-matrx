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
 * One offset is needed. `.shell-main` is pulled up by `-(--shell-header-h)` so
 * (core) content scrolls BEHIND the transparent glass header — and any pane
 * that fills it (`/chat`'s conversation column is `absolute inset-0` inside it)
 * inherits that: the scrollport's top edge sits UNDER the header, not below it.
 * So `top: 0` there would pin the toolbar right back onto the header, which is
 * the whole defect.
 *
 * Rather than name the containers that do this — the first version of this fix
 * checked for `.shell-main` and missed /chat exactly this way — measure it: how
 * much of the fixed header actually overlaps our scrollport. Panes that start
 * below the header overlap by nothing and get `top: 0`. Measured once when the
 * toolbar mounts; the header is a fixed height and the scrollport's top edge
 * does not move under it, so there is nothing to re-measure on resize.
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
  const [topInset, setTopInset] = useState(0);

  useEffect(() => {
    // Where a `top: 0` sticky child would come to rest: the scrollport's
    // content-box top. No scrolling ancestor means the document scrolls, and
    // its rest position is the viewport top — 0, which is where the header is.
    let restTop = 0;
    let node = rootRef.current?.parentElement ?? null;
    while (node) {
      const style = getComputedStyle(node);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        restTop =
          node.getBoundingClientRect().top +
          node.clientTop +
          (parseFloat(style.paddingTop) || 0);
        break;
      }
      node = node.parentElement;
    }
    const headerBottom =
      document.querySelector(".shell-header")?.getBoundingClientRect().bottom ??
      0;
    setTopInset(Math.max(0, Math.round(headerBottom - restTop)));
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
      style={{ top: topInset }}
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
