// components/mermaid/print-render.ts
//
// Draw every mermaid fence in a markdown string, for a PRINT of that markdown
// (the studio's and a message's Print / Save PDF, through @ai-matrx/print's
// `renderFence`). Printed pages are light, so diagrams draw in the default
// light theme whatever the app's mode. A diagram that fails to draw prints as
// its source (the package's code block) — and is counted, never silent.

import { renderMermaid } from "./runtime";
import type { MermaidRenderOptions } from "./types";

const PRINT_OPTIONS: MermaidRenderOptions = { theme: "default", look: "classic", layout: "dagre" };

/** The source of every ```mermaid fence, as the print package will hand it back. */
export function mermaidFenceSources(markdown: string): string[] {
  const out: string[] = [];
  const lines = markdown.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)(`{3,}|~{3,})\s*mermaid\b[^`]*$/.exec(lines[i] as string);
    if (!open) continue;
    const marker = open[2] as string;
    const indent = (open[1] as string).length;
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const close = /^\s*(`{3,}|~{3,})\s*$/.exec(lines[j] as string);
      if (close && (close[1] as string)[0] === marker[0] && (close[1] as string).length >= marker.length) break;
      body.push(lines[j] as string);
    }
    out.push(body.map((l) => l.slice(Math.min(indent, l.length - l.trimStart().length))).join("\n"));
    i = j;
  }
  return out;
}

export interface PrintedDiagrams {
  /** SVG by fence source. */
  pictures: Map<string, string>;
  /** Fences that could not be drawn (they print as source). */
  failed: number;
}

export async function drawMermaidForPrint(markdown: string): Promise<PrintedDiagrams> {
  const pictures = new Map<string, string>();
  let failed = 0;
  for (const source of new Set(mermaidFenceSources(markdown))) {
    try {
      const { svg } = await renderMermaid(source, PRINT_OPTIONS);
      pictures.set(source, svg);
    } catch {
      failed++;
    }
  }
  return { pictures, failed };
}
