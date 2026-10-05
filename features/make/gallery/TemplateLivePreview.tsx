"use client";

// features/make/gallery/TemplateLivePreview.tsx — lane CHAIR-GALLERY-2 (Unified Data System v7), 2026-10-05.
//
// THE TEMPLATE, ON THE REAL SCREENS. Arman: people must SEE exactly what they will get. Once the page is
// in the browser this mounts @ai-matrx/records-ui's TemplatePreview — the canonical table page (grid,
// board, calendar, timeline, gallery, list; a click opens the record page) over the template installed
// into memory (@ai-matrx/records/memory). Read-only: nothing is read from or written to any store.
//
// Until then the server HTML passed as `children` stays on screen — it is what a crawler reads and what
// first paint shows — and it is swapped for the live screens only once their code has loaded, in a box
// that keeps its height, so nothing jumps.

import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import type { TemplateSpec } from "@ai-matrx/records/templates";

// Typed here, not imported: TemplatePreview arrives with @ai-matrx/records-ui > 0.101.2, and until that
// version is installed the server skeleton simply stays (the import finds no component).
type TemplatePreviewProps = { spec: TemplateSpec; today?: string };

export function TemplateLivePreview({
  spec,
  today,
  children,
}: {
  spec: TemplatePreviewProps["spec"];
  today: string;
  children: ReactNode;
}) {
  const [Live, setLive] = useState<ComponentType<TemplatePreviewProps> | null>(null);
  useEffect(() => {
    let gone = false;
    void import("@ai-matrx/records-ui").then((m) => {
      const found = (m as unknown as Record<string, unknown>)["TemplatePreview"];
      if (!gone && typeof found === "function") setLive(() => found as ComponentType<TemplatePreviewProps>);
    });
    return () => {
      gone = true;
    };
  }, []);
  return (
    <div className="min-h-[36rem] min-w-0" data-template-live={Live ? "on" : "off"}>
      {Live ? <Live spec={spec} today={today} /> : children}
    </div>
  );
}
