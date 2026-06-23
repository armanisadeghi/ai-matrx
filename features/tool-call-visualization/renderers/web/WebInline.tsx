"use client";

/**
 * WebInline — the inline dispatcher for the REAL, current web tool
 * (`tool_name="web"`). The web tool is a SINGLE tool whose behavior is selected
 * by `arguments.action`; this component routes the call into the existing
 * canonical renderer for that action:
 *
 *   • "search"               → SearchInline (the Google-class results page).
 *   • "batch_read" / "read"  → ScrapeInline (the per-page reading cards).
 *   • anything else / missing → GenericRenderer (a clean, honest fallback).
 *
 * It is a PURE passthrough: every `ToolRendererProps` field flows straight to
 * the dispatched child, and this wrapper adds NO frame of its own. That matters
 * for nesting — the card shell (`ToolCallVisualization`) already draws the one
 * border around the expanded body, and `SearchInline` / `ScrapeInline` render
 * flush content inside it. Adding a border here would have produced the
 * triple-bordered "Web · N calls" batch the owner flagged. One frame, not three.
 *
 * Action resolution lives in `webAction.ts` (shared with the overlay so the two
 * never drift). React Compiler is on — no manual memo.
 */

import React from "react";

import type { ToolRendererProps } from "../../types";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { getArg } from "../_shared";
import { SearchInline } from "../search/SearchInline";
import { ScrapeInline } from "../scrape/ScrapeInline";
import { resolveWebActionKind } from "./webAction";

export const WebInline: React.FC<ToolRendererProps> = (props) => {
  const kind = resolveWebActionKind(getArg<string>(props.entry, "action"));

  if (kind === "search") return <SearchInline {...props} />;
  if (kind === "read") return <ScrapeInline {...props} />;

  // Unknown / missing action — a clean generic fallback, never a wrong guess.
  return <GenericRenderer {...props} />;
};
