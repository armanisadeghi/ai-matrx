// features/spaces/editor/code-block.ts — Notion's code block (C10) on BlockNote's: language picker
// (BlockNote's own), and on hover Copy, Wrap and Caption; a caption line under the code.
//
// BlockNote's code block renders vanilla DOM, so this decorates that DOM. The stored `caption` is
// RichSpan[] (BLOCK-SCHEMA); on the engine it rides as a JSON string (convert.ts) and is edited here as
// plain text. `wrap` is an extra stored prop (allowed on any block).

import { createCodeBlockSpec } from "@blocknote/core";

import type { RichSpan } from "../contract";

type CodeSpec = ReturnType<typeof createCodeBlockSpec>;

export function captionText(raw: unknown): string {
  try {
    const spans = JSON.parse(String(raw || "[]")) as RichSpan[];
    return Array.isArray(spans) ? spans.map((s) => s.text).join("") : "";
  } catch {
    return "";
  }
}

/** Keys and clicks inside our controls never reach ProseMirror (it listens on the editor root). */
function isolate(el: HTMLElement) {
  for (const type of ["keydown", "keypress", "beforeinput", "input", "paste", "mousedown", "compositionstart", "compositionend"]) {
    el.addEventListener(type, (e) => e.stopPropagation());
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "spaces-code-action";
  b.textContent = label;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

export function notionCodeBlock(base: CodeSpec): CodeSpec {
  const config = {
    ...base.config,
    propSchema: { ...base.config.propSchema, wrap: { default: false }, caption: { default: "" } },
  };
  const render: CodeSpec["implementation"]["render"] = function (this: unknown, block, editor) {
    const view = base.implementation.render.call(this as never, block, editor);
    const dom = view.dom as HTMLElement;
    const props = block.props as Record<string, unknown>;
    const wrap = props.wrap === true;
    const caption = captionText(props.caption);
    dom.dataset.wrap = wrap ? "true" : "false";

    const bar = document.createElement("div");
    bar.className = "spaces-code-actions";
    bar.contentEditable = "false";
    isolate(bar);
    const copy = button("Copy", () => {
      const text = (view.contentDOM as HTMLElement | undefined)?.textContent ?? "";
      void navigator.clipboard.writeText(text).then(
        () => {
          copy.textContent = "Copied";
          window.setTimeout(() => (copy.textContent = "Copy"), 1200);
        },
        () => (copy.textContent = "Copy failed"),
      );
    });
    bar.append(copy);
    if (editor.isEditable) {
      bar.append(button(wrap ? "Unwrap" : "Wrap", () => editor.updateBlock(block, { props: { wrap: !wrap } } as never)));
      if (!caption) {
        bar.append(
          button("Caption", () => {
            line.hidden = false;
            input.focus();
          }),
        );
      }
    }
    dom.append(bar);

    const line = document.createElement("div");
    line.className = "spaces-code-caption";
    line.contentEditable = "false";
    line.hidden = !caption;
    isolate(line);
    const input = document.createElement("input");
    input.type = "text";
    input.value = caption;
    input.placeholder = "Write a caption";
    input.readOnly = !editor.isEditable;
    input.setAttribute("aria-label", "Code caption");
    const commit = () => {
      const next = input.value.trim();
      if (next === caption) {
        if (!next) line.hidden = true;
        return;
      }
      editor.updateBlock(block, { props: { caption: next ? JSON.stringify([{ text: next }]) : "" } } as never);
    };
    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        input.blur();
      }
    });
    line.append(input);
    dom.append(line);
    return view;
  };
  return { ...base, config, implementation: { ...base.implementation, render } } as unknown as CodeSpec;
}
