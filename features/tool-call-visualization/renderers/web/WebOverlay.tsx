"use client";

/**
 * WebOverlay — the overlay/window dispatcher for the REAL web tool
 * (`tool_name="web"`). Mirrors {@link WebInline}: it routes by
 * `arguments.action` into the matching canonical FULL view —
 *
 *   • "search"               → SearchOverlay (the full "hide nothing" results).
 *   • "batch_read" / "read"  → ScrapeOverlay (page list + full page content).
 *   • anything else / missing → GenericRenderer.
 *
 * Pure passthrough of every `ToolRendererProps` field; no frame of its own (the
 * overlay chrome supplies the frame). Shared action resolution via
 * `webAction.ts`. React Compiler is on — no manual memo.
 */

import React from "react";

import type { ToolRendererProps } from "../../types";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { getArg } from "../_shared";
import { SearchOverlay } from "../search/SearchOverlay";
import { ScrapeOverlay } from "../scrape/ScrapeOverlay";
import { resolveWebActionKind } from "./webAction";

export const WebOverlay: React.FC<ToolRendererProps> = (props) => {
  const kind = resolveWebActionKind(getArg<string>(props.entry, "action"));

  if (kind === "search") return <SearchOverlay {...props} />;
  if (kind === "read") return <ScrapeOverlay {...props} />;

  return <GenericRenderer {...props} />;
};
