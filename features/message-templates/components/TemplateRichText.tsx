"use client";

// A template body as it will read in a chat message: rendered as markdown through THE engine
// (`RichContent`), with every `{{merge.field}}` still drawn as the same chip the editor draws
// (MERGE_FIELD_CHIP_CLASS, plain name or example value). The body is markdown (it goes into
// messages as markdown), so **bold** shows as bold wherever it is read, never as literal asterisks.
//
// Mechanism: each field is swapped for an inert word before rendering (markdown cannot disturb a plain
// letters-and-digits token), then the rendered text nodes get the chip back.

import { useLayoutEffect, useMemo, useRef } from "react";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { MERGE_FIELD_CHIP_CLASS } from "@/components/merge-field-input/MergeFieldInput";
import { mergeFieldRegex } from "@/components/merge-field-input/merge-field-dom";
import { mergeFieldInfo, type MergeFieldInfo } from "@/features/message-templates/lib/merge-fields";

const MARK = /matrx(field|example)(\d+)end/g;
// `\{{x}}` is an example: kept out of the engine (which would draw `{{x}}` as a variable) and put back as plain text.
const ESCAPED_EXAMPLE = /\\(\{\{[^{}\n]*\}\})/g;

export function TemplateRichText({ text, show = "names", className }: { text: string; show?: "names" | "example"; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const { source, fields, examples } = useMemo(() => {
    const found: MergeFieldInfo[] = [];
    const literal: string[] = [];
    const held = text.replace(ESCAPED_EXAMPLE, (_all, braces: string) => {
      literal.push(braces);
      return `matrxexample${literal.length - 1}end`;
    });
    const swapped = held.replace(mergeFieldRegex(), (_all, path: string) => {
      found.push(mergeFieldInfo(path));
      return `matrxfield${found.length - 1}end`;
    });
    return { source: swapped, fields: found, examples: literal };
  }, [text]);

  // The engine renders (and re-renders) on its own schedule, so the chips are put back whenever its DOM moves.
  useLayoutEffect(() => {
    const root = host.current;
    if (!root || (fields.length === 0 && examples.length === 0)) return;
    const apply = () => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/matrx(?:field|example)\d+end/.test(n.nodeValue ?? "")) nodes.push(n as Text);
    for (const node of nodes) {
      const value = node.nodeValue ?? "";
      const fragment = document.createDocumentFragment();
      let last = 0;
      for (const m of value.matchAll(MARK)) {
        const at = m.index ?? 0;
        if (at > last) fragment.append(value.slice(last, at));
        if (m[1] === "example") {
          fragment.append(examples[Number(m[2])] ?? m[0]);
          last = at + m[0].length;
          continue;
        }
        const field = fields[Number(m[2])];
        const chip = document.createElement("span");
        chip.className = show === "names" ? MERGE_FIELD_CHIP_CLASS : "rounded bg-muted px-1 text-foreground";
        chip.title = field ? `${field.label} — filled in when the template is used` : "";
        chip.setAttribute("data-merge-field", field?.path ?? "");
        chip.textContent = field ? (show === "names" ? field.label : field.example) : m[0];
        fragment.append(chip);
        last = at + m[0].length;
      }
      if (last < value.length) fragment.append(value.slice(last));
      node.replaceWith(fragment);
    }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [fields, examples, show, source]);

  return (
    <div ref={host} className={className}>
      <RichContent key={`${show}:${source}`} source={source} level="standard" />
    </div>
  );
}
