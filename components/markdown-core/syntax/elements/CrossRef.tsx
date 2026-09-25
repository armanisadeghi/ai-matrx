"use client";

// A cross-reference (`@fig:growth`, `\eqref{eq:energy}`, `@sec:intro`).
// Resolved statically when the target is in the same rendered block; else
// looked up in the browser across the whole document (a target's element
// carries `data-xref-label`, e.g. "Figure 2"). Still missing → shown as
// what was written, flagged, with the reason on hover — never a dead link.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InDocAnchor } from "./InDocAnchor";
import { findInDocument } from "./find-in-document";

interface CrossRefProps {
  href?: string;
  title?: string;
  children?: ReactNode;
  "data-xref"?: string;
  "data-xref-kind"?: string;
  "data-xref-style"?: string;
  "data-xref-resolved"?: string;
}

function labelFor(target: HTMLElement, style: string | undefined): string | null {
  const label = target.getAttribute("data-xref-label");
  if (label) {
    if (label.startsWith("Equation ")) {
      const n = label.slice("Equation ".length);
      return style === "ref" ? n.replace(/[()]/g, "") : n;
    }
    return label;
  }
  if (/^H[1-6]$/.test(target.tagName)) {
    const clone = target.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[data-heading-anchor]").forEach((a) => a.remove());
    return (clone.textContent ?? "").trim() || null;
  }
  return null;
}

export function CrossRef(props: CrossRefProps) {
  const label = String(props["data-xref"] ?? "");
  const resolvedStatically = props["data-xref-resolved"] === "true";
  const probe = useRef<HTMLSpanElement>(null);
  const [runtime, setRuntime] = useState<string | null>(null);
  const [looked, setLooked] = useState(resolvedStatically);
  const style = props["data-xref-style"];

  useEffect(() => {
    if (resolvedStatically) return;
    const target = findInDocument(probe.current, label);
    setRuntime(target ? labelFor(target, style) : null);
    setLooked(true);
  }, [label, resolvedStatically, style]);

  if (resolvedStatically || runtime) {
    return (
      <InDocAnchor href={`#${label}`} data-xref={label} className="no-underline hover:underline">
        {runtime ?? props.children}
      </InDocAnchor>
    );
  }
  return (
    <span
      ref={probe}
      data-xref={label}
      data-xref-missing={looked ? "" : undefined}
      title={props.title}
      className={cn(looked && "rounded-sm bg-amber-500/15 px-0.5 text-amber-700 dark:text-amber-300")}
    >
      {props.children}
      {looked ? "?" : null}
    </span>
  );
}
