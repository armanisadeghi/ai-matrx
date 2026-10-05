"use client";

// Wraps a rendered instance: when the URL carries `?field=<part key>` (a
// citation's place), find the element showing that field/item, scroll it into
// view and ring it. The kind components have no per-field anchors, so the
// place is found by its own words (`citedFieldProbes`).

import { useEffect, useRef, type ReactNode } from "react";
import { citedFieldProbes } from "@/features/content-ir/studio/citedField";

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
  useEffect(() => {
    const root = ref.current;
    if (!root || !field) return;
    const probes = citedFieldProbes(data, field);
    if (!probes.length) return;
    let marked: HTMLElement | null = null;
    let tries = 0;
    const find = () => {
      for (const probe of probes) {
        const hit = deepestContaining(root, probe);
        if (hit) {
          // Lift to the nearest block-level container so the ring frames the item, not one word.
          let el: HTMLElement = hit;
          while (el.parentElement && el.parentElement !== root && getComputedStyle(el).display.startsWith("inline")) {
            el = el.parentElement;
          }
          marked = el;
          el.setAttribute("data-cited-field", field);
          el.classList.add(...RING);
          el.scrollIntoView({ block: "center", behavior: "smooth" });
          return true;
        }
      }
      return false;
    };
    // The kind component may paint after mount (lazy chunks) — retry briefly.
    const timer = window.setInterval(() => {
      tries += 1;
      if (find() || tries > 20) window.clearInterval(timer);
    }, 250);
    return () => {
      window.clearInterval(timer);
      marked?.classList.remove(...RING);
      marked?.removeAttribute("data-cited-field");
    };
  }, [field, data]);
  return <div ref={ref}>{children}</div>;
}
