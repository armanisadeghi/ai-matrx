"use client";

/**
 * The `record-peek` canvas kind — the Detail primitive's docked presentation.
 * Light on purpose: it registers at boot, so the body (the presentation, the
 * type map, the record registry) loads only when a peek tab renders.
 */

import { ExternalLink, PanelRight } from "lucide-react";
import { createElement } from "react";
import { defineCanvasKind, type AnyCanvasKind, type CanvasKindProps, type CanvasMenuItem } from "@ai-matrx/canvas/react";
import { KindHeaderSlot } from "@/features/canvas/host/kindHeaderSlot";
import { detailPageHref } from "../DetailHost";
import { RECORD_PEEK_KIND, readRecordPeekData } from "./recordPeek";

function recordPeekMenu({ data }: CanvasKindProps): readonly CanvasMenuItem[] {
  const record = readRecordPeekData(data);
  if (!record) return [];
  return [
    {
      id: "open-new-tab",
      label: "Open in new tab",
      icon: createElement(ExternalLink),
      onSelect: () => window.open(detailPageHref(record, { list: record.list }), "_blank", "noopener"),
    },
  ];
}

export const RECORD_PEEK_CANVAS_KIND: AnyCanvasKind = defineCanvasKind({
  id: RECORD_PEEK_KIND,
  surface: "dom",
  label: "Record",
  icon: PanelRight,
  load: () => import("./RecordPeekCanvasView"),
  // A record's truth is its row: the tab comes back after a reload and reads it again.
  restore: true,
  HeaderAction: KindHeaderSlot,
  menuItems: recordPeekMenu,
});
