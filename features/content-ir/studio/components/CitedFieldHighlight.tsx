"use client";

// Wraps a rendered instance: when the URL carries `?field=<part key>` (a
// citation's place), find the element showing that field/item, scroll it into
// view and ring it. The kind components have no per-field anchors, so the
// place is found by its own words (`citedFieldProbes`).

import { useEffect, useRef, useState, type ReactNode } from "react";
import { citedFieldProbes, citedFieldTexts } from "@/features/content-ir/studio/citedField";
import { fieldLabelOfPart } from "@/features/education/trust/recordCitation";

const RING = ["ring-2", "ring-primary", "bg-primary/10", "rounded-md", "transition-shadow"];

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** The deepest element under `root` whose text contains `probe`. */
function deepestContaining(root: HTMLElement, probe: string): HTMLElement | null {
  const needle = norm(probe);
  let best: HTMLElement | null = null;
  const walk = (el: HTMLElement) => {
    if (!norm(el.textContent ?? "").includes(needle)) return;
    best = el;
    for (const child of Array.from(el.children)) walk(child as HTMLElement);
  };
  walk(root);
  return best === root ? null : best;
}

export default function CitedFieldHighlight({
  field,
  data,
  children,
}: {
  field: string | null;
  data: unknown;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The instance renders where this page cannot reach (a kind component in its
  // sandbox frame) or never shows those words: the cited place is shown here,
  // ringed, above it — a citation never lands on an unmarked page.
  const [unreached, setUnreached] = useState<string | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !field) return;
    const probes = citedFieldProbes(data, field);
    if (!probes.length) return;
    let marked: HTMLElement | null = null;
    let tries = 0;
    const find = () => {
      // Every probe's deepest element, then the smallest element holding them
      // all: the item's own tile (a flip card shows its front and back as two
      // faces — the tile frames both, never a hidden face).
      const hits = probes
        .map((probe) => deepestContaining(root, probe))
        .filter((el): el is HTMLElement => el !== null);
      if (!hits.length) return false;
      let el: HTMLElement = hits[0]!;
      for (const other of hits.slice(1)) {
        while (el !== root && !el.contains(other)) el = el.parentElement ?? root;
      }
      if (el === root) el = hits[0]!;
      // Lift to a block-level container so the ring frames the item, not one word.
      while (
        el.parentElement &&
        el.parentElement !== root &&
        getComputedStyle(el).display.startsWith("inline")
      ) {
        el = el.parentElement;
      }
      marked = el;
      el.setAttribute("data-cited-field", field);
      el.classList.add(...RING);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      return true;
    };
    // The kind component may paint after mount (lazy chunks) — retry briefly.
    const timer = window.setInterval(() => {
      tries += 1;
      if (find()) {
        window.clearInterval(timer);
        return;
      }
      // A sandboxed frame is opaque to this page: no retry will ever find it.
      if (tries > 20 || root.querySelector("iframe")) {
        window.clearInterval(timer);
        setUnreached(field);
      }
    }, 250);
    return () => {
      window.clearInterval(timer);
      marked?.classList.remove(...RING);
      marked?.removeAttribute("data-cited-field");
    };
  }, [field, data]);
  // Only for the field it was set for — a later field starts unmarked.
  const texts = unreached && unreached === field ? citedFieldTexts(data, unreached) : [];
  return (
    <div>
      {texts.length ? (
        <div
          data-cited-field={unreached}
          className="mb-3 rounded-md bg-primary/10 p-3 text-sm ring-2 ring-primary"
        >
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Cited · {fieldLabelOfPart(unreached!) ?? unreached}
          </p>
          {texts.slice(0, 8).map((t) => (
            <p key={t} className="line-clamp-4 text-foreground">
              {t}
            </p>
          ))}
        </div>
      ) : null}
      <div ref={ref}>{children}</div>
    </div>
  );
}
