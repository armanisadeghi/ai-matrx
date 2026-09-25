// ─────────────────────────────────────────────────────────────────────────
// SOURCE-LEVEL SPELLINGS → the one directive grammar.
//
// Two ecosystems write containers in a shape micromark cannot parse as a
// container, so the core rewrites them to the generic directive form BEFORE
// parsing (render-only — stored text is never touched; the editor keeps the
// author's spelling, see the content-ir tokenizer islands):
//
//   MkDocs admonition            →  :::note[Title]            (indented body, dedented)
//     !!! note "Title"
//         body
//   MkDocs collapsible           →  :::tip[Title]{fold}  /  {fold=open} for `???+`
//     ??? tip "Title"
//   Docusaurus titled container  →  :::warning[Careful here]
//     :::warning Careful here
//
// Fenced code is never rewritten. Pure and idempotent; returns the input
// itself when nothing matched (the common case costs one scan).
// ─────────────────────────────────────────────────────────────────────────

import { resolveCalloutType } from "./callout-types";
import { CONTAINER_DIRECTIVES } from "./names";

const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})/;
const MKDOCS_OPEN = /^(!!!|\?\?\?\+?)[ \t]+([A-Za-z][\w-]*)(?:[ \t]+[\w-]+)*(?:[ \t]+"((?:[^"\\]|\\.)*)")?[ \t]*$/;
const DOCUSAURUS_TITLED = /^(:{3,})([A-Za-z][\w-]*)[ \t]+([^\s{[][^\n]*?)[ \t]*$/;
/** One indent level of an admonition body: 4 spaces, a tab, or the 8 nbsp prose preparation turns 4 spaces into. */
const INDENT = /^(?: {4}|\t|(?:\u00A0){8})/;
const BLANKISH = /^[ \t\u00A0]*$|^&nbsp;$/;

function escapeLabel(text: string): string {
  return text.replace(/\\"/g, '"').replace(/([[\]])/g, "\\$1");
}

function longestColonRun(lines: string[]): number {
  let max = 0;
  for (const line of lines) {
    const m = /^[ \t]*(:{3,})/.exec(line);
    if (m && m[1].length > max) max = m[1].length;
  }
  return max;
}

export function rewriteContainerSpellings(source: string): string {
  if (!source || (!source.includes("!!!") && !source.includes("???") && !source.includes(":::"))) {
    return source;
  }
  const lines = source.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const f = FENCE.exec(line);
    if (f) {
      const marker = f[1] as string;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      out.push(line);
      continue;
    }
    if (fence !== null) {
      out.push(line);
      continue;
    }

    const mk = MKDOCS_OPEN.exec(line);
    if (mk && resolveCalloutType(mk[2])) {
      const opener = mk[1] as string;
      const type = (mk[2] as string).toLowerCase();
      const title = mk[3];
      // Collect the indented body (blank lines belong to it only when an
      // indented line follows them).
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const candidate = lines[j] ?? "";
        if (INDENT.test(candidate)) {
          body.push(candidate.replace(INDENT, ""));
          j++;
          continue;
        }
        if (BLANKISH.test(candidate)) {
          let k = j;
          while (k < lines.length && BLANKISH.test(lines[k] ?? "")) k++;
          if (k < lines.length && INDENT.test(lines[k] ?? "")) {
            for (let b = j; b < k; b++) body.push("");
            j = k;
            continue;
          }
        }
        break;
      }
      const colons = ":".repeat(Math.max(3, longestColonRun(body) + 1));
      const label = title && title.length > 0 ? `[${escapeLabel(title)}]` : "";
      const attrs = opener === "???" ? "{fold}" : opener === "???+" ? "{fold=open}" : "";
      out.push(`${colons}${type}${label}${attrs}`, ...body, colons);
      i = j - 1;
      changed = true;
      continue;
    }

    const docu = DOCUSAURUS_TITLED.exec(line);
    if (
      docu &&
      (resolveCalloutType(docu[2]) || CONTAINER_DIRECTIVES.has((docu[2] as string).toLowerCase()))
    ) {
      out.push(`${docu[1]}${docu[2]}[${escapeLabel(docu[3] as string)}]`);
      changed = true;
      continue;
    }

    out.push(line);
  }
  return changed ? out.join("\n") : source;
}
