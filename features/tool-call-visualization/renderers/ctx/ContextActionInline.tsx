"use client";

/**
 * ContextActionInline — inline + overlay renderer for the LIVE unified
 * `context` tool (verified in chat.tool_call: it replaced `ctx_get` /
 * `ctx_batch`, whose last calls were 2026-06-21). One tool, routed by the
 * `action` argument:
 *
 *   action: "get"    → { key, mode?, action }            → ctx_get result shape
 *   action: "batch"  → { action, requests: [{key}...] }  → ctx_batch result shape
 *
 * The result shapes are identical to the legacy tools', so this component is a
 * pure dispatcher onto `CtxGetInline` / `CtxBatchInline` (both fall back to
 * `<ResultValue>` on non-conforming results — nothing is ever hidden). Unknown
 * future actions fall through to the GenericRenderer so they stay visible.
 */

import React from "react";

import type { ToolRendererProps } from "../../types";
import { getArg } from "../_shared";
import type { ResultDensity } from "../../result-fields/ResultValue";
import { GenericRenderer } from "../../registry/GenericRenderer";
import { CtxGetInline } from "./CtxGetInline";
import { CtxBatchInline } from "./CtxBatchInline";

interface Props extends ToolRendererProps {
  density?: ResultDensity;
}

export const ContextActionInline: React.FC<Props> = (props) => {
  const action = (getArg<string>(props.entry, "action") ?? "get").trim();

  if (action === "batch") return <CtxBatchInline {...props} />;
  if (action === "get" || action === "") return <CtxGetInline {...props} />;

  return <GenericRenderer {...props} />;
};
