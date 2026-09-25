"use client";

// An in-document link (`#id`): footnote references and back-links, heading
// anchors, table-of-contents entries, cross-references. It scrolls to the
// target in the NEAREST document (several answers on one page share ids like
// `user-content-fn-1`), updates the address bar so the section can be shared,
// and — for a footnote reference — previews the note on hover or focus.

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { findInDocument } from "./find-in-document";

type AnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children?: ReactNode;
  "data-footnote-ref"?: unknown;
  "data-footnote-backref"?: unknown;
  "data-heading-anchor"?: unknown;
  node?: unknown;
};

function targetId(href: string): string {
  try {
    return decodeURIComponent(href.slice(1));
  } catch {
    return href.slice(1);
  }
}

function noteText(target: HTMLElement): string {
  const clone = target.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-footnote-backref]").forEach((el) => el.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function InDocAnchor({ href, children, className, node: _node, onClick, ...rest }: AnchorProps) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [preview, setPreview] = useState<{ text: string; top: number; left: number } | null>(null);
  const isFootnoteRef = rest["data-footnote-ref"] !== undefined && rest["data-footnote-ref"] !== false;
  const id = targetId(href);

  const show = () => {
    if (!isFootnoteRef) return;
    const target = findInDocument(ref.current, id);
    const rect = ref.current?.getBoundingClientRect();
    if (!target || !rect) return;
    const text = noteText(target);
    if (!text) return;
    setPreview({ text, top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 336)) });
  };

  return (
    <a
      ref={ref}
      href={href}
      {...rest}
      className={cn(
        !rest["data-heading-anchor"] && "text-primary underline-offset-2 hover:underline",
        className,
      )}
      onMouseEnter={show}
      onFocus={show}
      onMouseLeave={() => setPreview(null)}
      onBlur={() => setPreview(null)}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
        const target = findInDocument(ref.current, id);
        if (!target) return;
        event.preventDefault();
        setPreview(null);
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (typeof target.animate === "function") {
          target.animate(
            [{ backgroundColor: "hsl(var(--primary) / 0.18)" }, { backgroundColor: "transparent" }],
            { duration: 1600, easing: "ease-out" },
          );
        }
        try {
          window.history.replaceState(window.history.state, "", `#${encodeURIComponent(id)}`);
        } catch {
          // A sandboxed frame may refuse history writes; the scroll already happened.
        }
      }}
    >
      {children}
      {preview &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: preview.top, left: preview.left }}
            className="pointer-events-none fixed z-[100] block w-80 max-w-[calc(100vw-16px)] rounded-md border border-border bg-popover px-3 py-2 text-xs font-normal leading-relaxed text-popover-foreground shadow-lg"
          >
            {preview.text}
          </span>,
          document.body,
        )}
    </a>
  );
}
