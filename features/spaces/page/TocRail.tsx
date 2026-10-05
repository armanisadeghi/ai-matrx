"use client";

// features/spaces/page/TocRail.tsx — Notion's floating table of contents at the page's right edge (A11):
// one short dash per heading, the section you are reading drawn darker; hovering opens the outline
// with every heading's name, and a click scrolls to it. Hidden on narrow screens, as Notion does.

import { useEffect, useMemo, useRef, useState } from "react";

import type { SpaceBlock } from "../contract";

interface Heading {
  id: string;
  level: number;
  text: string;
}

function headingsOf(blocks: SpaceBlock[]): Heading[] {
  const out: Heading[] = [];
  const walk = (list: SpaceBlock[]) => {
    for (const b of list) {
      if (b.type === "heading") {
        const text = (b.text ?? []).map((s) => s.text).join("").trim();
        if (text) out.push({ id: b.id, level: Number(b.props?.level ?? 1), text });
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

const STICK_PX = 140;

function blockEl(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.spaces-editor .bn-block-outer[data-id="${CSS.escape(id)}"]`);
}

export function TocRail({ blocks, scrollerRef, anchorRef }: { blocks: SpaceBlock[]; scrollerRef: React.RefObject<HTMLElement | null>; anchorRef: React.RefObject<HTMLElement | null> }) {
  const headings = useMemo(() => headingsOf(blocks), [blocks]);
  const [active, setActive] = useState(0);
  const [top, setTop] = useState<number | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || headings.length < 2) return;
    const measure = () => {
      frame.current = 0;
      // The rail starts beside the title and sticks 140px under the top bar once the title scrolls by.
      const anchor = anchorRef.current;
      const title = anchor?.querySelector<HTMLElement>(".spaces-title");
      if (anchor) setTop(Math.max(STICK_PX, anchor.offsetTop + (title?.offsetTop ?? 0) + 20 - scroller.scrollTop));
      const line = scroller.getBoundingClientRect().top + 140;
      let current = 0;
      headings.forEach((h, i) => {
        const el = blockEl(h.id);
        if (el && el.getBoundingClientRect().top <= line) current = i;
      });
      setActive(current);
    };
    const onScroll = () => {
      if (!frame.current) frame.current = window.requestAnimationFrame(measure);
    };
    measure();
    const late = window.setTimeout(measure, 800);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.clearTimeout(late);
      if (frame.current) window.cancelAnimationFrame(frame.current);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [headings, scrollerRef, anchorRef]);

  if (headings.length < 2 || top === null) return null;
  const go = (id: string) => blockEl(id)?.scrollIntoView({ block: "start", behavior: "smooth" });

  return (
    <div className="spaces-tocrail">
      <nav className="spaces-tocrail-sticky" style={{ top }} aria-label="Table of contents">
        <div className="spaces-tocrail-rail">
          {headings.map((h, i) => (
            <span key={h.id} className="spaces-tocrail-dash" data-active={i === active ? "true" : undefined} data-level={h.level} />
          ))}
        </div>
        <div className="spaces-tocrail-panel">
          {headings.map((h, i) => (
            <button
              key={h.id}
              type="button"
              className="spaces-tocrail-item"
              data-level={h.level}
              data-active={i === active ? "true" : undefined}
              onClick={() => go(h.id)}
            >
              {h.text}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
