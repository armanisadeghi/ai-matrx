// The formatting command layer on markdown TEXT (source view + every plain
// textarea host). Every case asserts the whole output string, so a command that
// moves one byte outside its span fails.

import { formatMarkdown, isFormatActive, formatCommandForKey, keyNameOf, type FormatCommandId } from "../core/markdown-format";
import { applySourceEdit } from "../core/source-format";

/** `[` and `]` mark the selection in the input; returns the output with the new selection marked. */
function run(marked: string, command: FormatCommandId): string {
  const from = marked.indexOf("[");
  const to = marked.indexOf("]") - 1;
  const text = marked.replace("[", "").replace("]", "");
  const result = formatMarkdown(text, from, to, command);
  const out = applySourceEdit(text, result);
  return `${out.slice(0, result.anchor)}[${out.slice(result.anchor, result.head)}]${out.slice(result.head)}`;
}

describe("inline commands toggle and touch only the selection", () => {
  test("bold adds and removes", () => {
    expect(run("say [hello] there", "bold")).toBe("say **[hello]** there");
    expect(run("say **[hello]** there", "bold")).toBe("say [hello] there");
    // Markers selected with the text unwrap too.
    expect(run("say [**hello**] there", "bold")).toBe("say [hello] there");
  });

  test("italic never eats a bold marker", () => {
    expect(run("a **[b]** c", "italic")).toBe("a ***[b]*** c");
    expect(run("a ***[b]*** c", "italic")).toBe("a **[b]** c");
    expect(run("a ***[b]*** c", "bold")).toBe("a *[b]* c");
    expect(run("a *[b]* c", "italic")).toBe("a [b] c");
    expect(run("a _[b]_ c", "italic")).toBe("a [b] c");
    expect(run("a __[b]__ c", "bold")).toBe("a [b] c");
  });

  test("strike and inline code", () => {
    expect(run("x [y] z", "strike")).toBe("x ~~[y]~~ z");
    expect(run("x ~~[y]~~ z", "strike")).toBe("x [y] z");
    expect(run("x [y] z", "code")).toBe("x `[y]` z");
    expect(run("x `[y]` z", "code")).toBe("x [y] z");
  });

  test("edge whitespace stays outside the markers", () => {
    expect(run("a[ b ]c", "bold")).toBe("a **[b]** c");
  });

  test("a caret in a word formats the word; a caret in space inserts a pair", () => {
    const text = "one two three";
    const caret = 5; // inside "two"
    const r = formatMarkdown(text, caret, caret, "bold");
    expect(applySourceEdit(text, r)).toBe("one **two** three");
    expect(r.anchor).toBe(caret + 2);
    const blank = formatMarkdown("a  b", 2, 2, "italic");
    expect(applySourceEdit("a  b", blank)).toBe("a ** b");
    expect(blank.anchor).toBe(3);
  });

  test("several lines: each line's text, never its list prefix", () => {
    expect(run("[- one\n- two]", "bold")).toBe("- **[one**\n- **two]**");
    expect(run("- **[one**\n- **two]**", "bold")).toBe("- [one\n- two]");
    expect(run("[# Title\n\npara]", "italic")).toBe("# *[Title*\n\n*para]*");
  });
});

describe("links", () => {
  test("wrap, unwrap, url selection", () => {
    expect(applySourceEdit("see docs", formatMarkdown("see docs", 4, 8, "link"))).toBe("see [docs]()");
    const linked = "see [docs](https://a.b) now";
    expect(applySourceEdit(linked, formatMarkdown(linked, 4, 23, "link"))).toBe("see docs now");
    expect(applySourceEdit(linked, formatMarkdown(linked, 5, 9, "link"))).toBe("see docs now");
    const url = "go https://x.y";
    expect(applySourceEdit(url, formatMarkdown(url, 3, 14, "link"))).toBe("go [](https://x.y)");
  });
});

describe("line commands toggle on the touched lines only", () => {
  test("headings set, switch level and clear", () => {
    expect(run("a\n[title]\nb", "heading1")).toBe("a\n# [title]\nb");
    expect(run("a\n# [title]\nb", "heading2")).toBe("a\n## [title]\nb");
    expect(run("a\n## [title]\nb", "heading2")).toBe("a\n[title]\nb");
    expect(run("[t]", "heading3")).toBe("### [t]");
  });

  test("lists: bullet, numbered, task; blank lines skipped; toggle off", () => {
    expect(run("[a\n\nb]", "bulletList")).toBe("- [a\n\n- b]");
    expect(run("- [a\n- b]", "bulletList")).toBe("[a\nb]");
    expect(run("[a\nb\nc]", "orderedList")).toBe("1. [a\n2. b\n3. c]");
    expect(run("- [a\n- b]", "orderedList")).toBe("1. [a\n2. b]");
    expect(applySourceEdit("a", formatMarkdown("a", 0, 1, "taskList"))).toBe("- [ ] a");
    expect(applySourceEdit("- [ ] a", formatMarkdown("- [ ] a", 6, 7, "taskList"))).toBe("a");
    expect(applySourceEdit("- [ ] a", formatMarkdown("- [ ] a", 6, 7, "bulletList"))).toBe("- a");
  });

  test("a list inside a quote stays inside it", () => {
    expect(run("> [a\n> b]", "bulletList")).toBe("> - [a\n> - b]");
    expect(run("> - [a]", "bulletList")).toBe("> [a]");
  });

  test("quote adds and removes", () => {
    expect(run("[a\nb]", "quote")).toBe("> [a\n> b]");
    expect(run("> [a\n> b]", "quote")).toBe("[a\nb]");
    expect(run("- [a]", "quote")).toBe("> - [a]");
  });

  test("code block wraps lines and unwraps", () => {
    expect(applySourceEdit("x\ncode\ny", formatMarkdown("x\ncode\ny", 2, 6, "codeBlock"))).toBe("x\n```\ncode\n```\ny");
    const fenced = "x\n```\ncode\n```\ny";
    expect(applySourceEdit(fenced, formatMarkdown(fenced, 6, 10, "codeBlock"))).toBe("x\ncode\ny");
    expect(applySourceEdit(fenced, formatMarkdown(fenced, 2, 14, "codeBlock"))).toBe("x\ncode\ny");
  });
});

describe("bytes are sacred", () => {
  const doc = "# Notes\n\nIntro *keep* this __exact__ spelling.\n\n* star list\n1) paren\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n";
  test.each<FormatCommandId>(["bold", "italic", "strike", "code", "link", "heading2", "bulletList", "orderedList", "taskList", "quote"])(
    "%s changes nothing outside the touched line",
    (command) => {
      const from = doc.indexOf("Intro");
      const to = from + "Intro".length;
      const out = applySourceEdit(doc, formatMarkdown(doc, from, to, command));
      const lineEnd = doc.indexOf("\n", to);
      // Prefix before the line and everything after the line are byte-identical.
      expect(out.startsWith(doc.slice(0, doc.lastIndexOf("\n", from) + 1))).toBe(true);
      expect(out.endsWith(doc.slice(lineEnd))).toBe(true);
    },
  );

  test("toggling twice returns the original bytes", () => {
    for (const command of ["bold", "italic", "strike", "code", "heading1", "bulletList", "orderedList", "taskList", "quote"] as const) {
      const from = doc.indexOf("Intro");
      const to = from + 5;
      const once = formatMarkdown(doc, from, to, command);
      const mid = applySourceEdit(doc, once);
      const back = applySourceEdit(mid, formatMarkdown(mid, once.anchor, once.head, command));
      expect({ command, back }).toEqual({ command, back: doc });
    }
  });
});

describe("pressed state", () => {
  test("isFormatActive reads the markup around the selection", () => {
    expect(isFormatActive("a **b** c", 4, 5, "bold")).toBe(true);
    expect(isFormatActive("a **b** c", 4, 5, "italic")).toBe(false);
    expect(isFormatActive("## t", 3, 4, "heading2")).toBe(true);
    expect(isFormatActive("- [ ] t", 6, 7, "taskList")).toBe(true);
    expect(isFormatActive("- [ ] t", 6, 7, "bulletList")).toBe(false);
    expect(isFormatActive("> q", 2, 3, "quote")).toBe(true);
  });
});

describe("keyboard chords", () => {
  const ev = (code: string, mods: Partial<KeyboardEvent> = {}) => ({ key: code.replace(/^(Key|Digit)/, "").toLowerCase(), code, metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  test("the brief's chords map to their commands", () => {
    expect(formatCommandForKey(keyNameOf(ev("KeyB"), true))).toBe("bold");
    expect(formatCommandForKey(keyNameOf(ev("KeyI"), true))).toBe("italic");
    expect(formatCommandForKey(keyNameOf(ev("KeyK"), true))).toBe("link");
    expect(formatCommandForKey(keyNameOf(ev("KeyX", { shiftKey: true }), true))).toBe("strike");
    expect(formatCommandForKey(keyNameOf(ev("KeyE"), true))).toBe("code");
    expect(formatCommandForKey(keyNameOf(ev("Digit7", { shiftKey: true, key: "&" }), true))).toBe("orderedList");
    expect(formatCommandForKey(keyNameOf(ev("Digit8", { shiftKey: true, key: "*" }), true))).toBe("bulletList");
    // Ctrl on Windows/Linux, never on a Mac.
    expect(formatCommandForKey(keyNameOf(ev("KeyB", { metaKey: false, ctrlKey: true }), false))).toBe("bold");
    expect(keyNameOf(ev("KeyB", { metaKey: false, ctrlKey: true }), true)).toBeNull();
    expect(formatCommandForKey(keyNameOf(ev("KeyC"), true))).toBeNull();
  });
});
