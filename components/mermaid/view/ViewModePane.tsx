"use client";

/**
 * VIEW mode — the diagram, and nothing else.
 *
 * The workbench's other three modes are all EDITORS: `visual` is tap-to-edit,
 * `outline` is structured rows, `code` is a CodeMirror/preview split. Before
 * this pane there was no way to simply LOOK at a diagram in the canvas, and
 * because `visual`/`outline` are gated on the structural-fidelity check, any
 * diagram with advanced syntax (subgraphs, `style` lines — i.e. most real ones)
 * fell back to `code` and greeted the user with source beside their diagram.
 *
 * So this is the default mode: full-pane, chrome-free, pan/zoom, no source. It
 * renders through `MermaidRenderer` — the same renderer behind the inline chat
 * block, the fullscreen view and the public share page — with the workbench's
 * LIVE render options, so theme/look/layout changes from the toolbar apply here
 * exactly as they do in the other modes.
 */

import React from "react";

import { MermaidRenderer } from "../MermaidRenderer";
import type { MermaidRenderOptions } from "../types";

interface ViewModePaneProps {
  source: string;
  options: MermaidRenderOptions;
}

export function ViewModePane({ source, options }: ViewModePaneProps) {
  return (
    <div className="h-full min-h-0 p-2">
      <MermaidRenderer source={source} options={options} fillHeight />
    </div>
  );
}
