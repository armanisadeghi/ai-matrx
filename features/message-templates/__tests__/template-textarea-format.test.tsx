/**
 * Prompt and template text boxes (the template editors' AutoResizeTextarea and
 * the HTML-page Plain tab): bytes are sacred.
 *
 *  1. Opening a box with a value writes nothing — onChange never fires, the
 *     text is byte-identical (trailing blank lines, {{variables}}).
 *  2. The one formatting layer works in it (Ctrl+B wraps the selection) and
 *     leaves every {{variable}} exactly as typed.
 */
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AutoResizeTextarea } from "../components/AutoResizeTextarea";
import { MarkdownPlainTextTab } from "@/features/html-pages/components/tabs/MarkdownPlainTextTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BYTES = "Hello {{first_name}},\n\nYour {{order.id}} is ready.\n\n\n  indented  \n";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function chord(el: HTMLTextAreaElement, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true }));
  });
}

function select(el: HTMLTextAreaElement, needle: string) {
  const start = el.value.indexOf(needle);
  act(() => {
    el.focus();
    el.setSelectionRange(start, start + needle.length);
  });
}

const PlainTab = ({ onChange }: { onChange: (v: string) => void }) => {
  const [md, setMd] = useState(BYTES);
  return (
    <MarkdownPlainTextTab
      {...({
        state: { currentMarkdown: md },
        actions: {
          setCurrentMarkdown: (v: string) => {
            onChange(v);
            setMd(v);
          },
        },
      } as unknown as React.ComponentProps<typeof MarkdownPlainTextTab>)}
    />
  );
};

const Template = ({ onChange }: { onChange: (v: string) => void }) => {
  const [v, setV] = useState(BYTES);
  return (
    <AutoResizeTextarea
      value={v}
      onChange={(e) => {
        onChange(e.target.value);
        setV(e.target.value);
      }}
    />
  );
};

describe.each([
  ["template box", Template],
  ["HTML-page Plain tab", PlainTab],
])("%s", (_name, Box) => {
  test("opening it with no edit writes nothing and keeps the bytes", () => {
    const onChange = jest.fn();
    act(() => root.render(<Box onChange={onChange} />));
    const el = host.querySelector("textarea") as HTMLTextAreaElement;
    expect(el.value).toBe(BYTES);
    select(el, "{{first_name}}");
    act(() => root.render(<Box onChange={onChange} />));
    expect(onChange).not.toHaveBeenCalled();
    expect(el.value).toBe(BYTES);
  });

  test("the formatting layer inserts markdown on request and never touches {{variables}}", () => {
    const onChange = jest.fn();
    act(() => root.render(<Box onChange={onChange} />));
    const el = host.querySelector("textarea") as HTMLTextAreaElement;
    select(el, "ready");
    chord(el, "b");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(el.value).toBe(BYTES.replace("ready", "**ready**"));
    expect(el.value).toContain("{{first_name}}");
    expect(el.value).toContain("{{order.id}}");
  });

  test("typing never auto-formats", () => {
    const onChange = jest.fn();
    act(() => root.render(<Box onChange={onChange} />));
    const el = host.querySelector("textarea") as HTMLTextAreaElement;
    chord(el, "q");
    expect(onChange).not.toHaveBeenCalled();
    expect(el.value).toBe(BYTES);
  });
});
