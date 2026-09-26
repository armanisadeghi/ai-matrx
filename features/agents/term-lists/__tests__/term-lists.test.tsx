import { act } from "react";
import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  normalizeEntries,
  parseTermCsv,
  validateEntries,
  type TermEntry,
} from "../types";
import { TermEntriesTable } from "../components/TermEntriesTable";

const toastCalls: string[] = [];
jest.mock("@/lib/toast", () => ({
  toast: {
    success: (m: string) => toastCalls.push(`success:${m}`),
    warning: (m: string) => toastCalls.push(`warning:${m}`),
    error: (m: string) => toastCalls.push(`error:${m}`),
  },
}));

// Plain-element stand-ins for the design-system primitives: the behaviour
// under test is the table's, not Radix's.
jest.mock("@ai-matrx/design-system", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Button: ({
      children,
      onClick,
      disabled,
      "aria-label": ariaLabel,
    }: {
      children?: ReactNode;
      onClick?: () => void;
      disabled?: boolean;
      "aria-label"?: string;
    }) => (
      <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
        {children}
      </button>
    ),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
      <textarea {...props} />
    ),
    Dialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogFooter: Pass,
    DialogTitle: Pass,
    Select: Pass,
    SelectTrigger: Pass,
    SelectValue: Pass,
    SelectContent: Pass,
    SelectItem: Pass,
  };
});

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const BRAND: TermEntry[] = [
  { term: "AI Matrx", value: "A-I May-tricks", kind: "pronounce" },
  { term: "All Green Recycling", kind: "do_not_translate" },
];

describe("term list entries — parsing and validation", () => {
  it("parses a spreadsheet paste (tabs) with a header row and kind aliases", () => {
    const result = parseTermCsv(
      "term\tvalue\tkind\tlanguage\nAI Matrx\tA-I May-tricks\tpronounce\t\nAll Green Recycling\t\tdo not translate\t\npickup\trecogida\t\tes",
      "translate",
    );
    expect(result.skipped).toEqual([]);
    expect(result.entries).toEqual([
      { term: "AI Matrx", value: "A-I May-tricks", kind: "pronounce" },
      { term: "All Green Recycling", kind: "do_not_translate" },
      { term: "pickup", value: "recogida", kind: "translate", language: "es" },
    ]);
  });

  it("honours quoted commas and names every skipped line", () => {
    const result = parseTermCsv(
      '"Green, Inc.",Green Incorporated,spell as\n,orphan value\nR2v3,,shout\nAI Matrx,,pronounce',
    );
    expect(result.entries).toEqual([
      { term: "Green, Inc.", value: "Green Incorporated", kind: "spell_as" },
    ]);
    expect(result.skipped.map((s) => s.line)).toEqual([2, 3, 4]);
  });

  it("flags a value-kind row with no value, ignores fully blank rows", () => {
    expect(
      validateEntries([
        { term: "AI Matrx", kind: "pronounce" },
        { term: "", kind: "translate" },
        { term: "", value: "x", kind: "translate" },
      ]),
    ).toEqual([
      { row: 1, message: "Pronounce as needs a value" },
      { row: 3, message: "Term is empty" },
    ]);
    expect(validateEntries(BRAND)).toEqual([]);
  });

  it("normalizes to the stored shape: trimmed, blank rows dropped, no stray values", () => {
    expect(
      normalizeEntries([
        { term: "  R2v3 ", value: "ignored", kind: "boost", language: " " },
        { term: "", kind: "boost" },
      ]),
    ).toEqual([{ term: "R2v3", kind: "boost" }]);
  });
});

describe("TermEntriesTable", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    toastCalls.length = 0;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  function render(entries: TermEntry[], onChange: (e: TermEntry[]) => void) {
    act(() => {
      root.render(
        <TermEntriesTable
          entries={entries}
          onChange={onChange}
          defaultKind="translate"
          problemRows={new Set()}
        />,
      );
    });
  }

  function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    act(() => {
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(host.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
    );
    if (!found) throw new Error(`no button "${label}"`);
    return found;
  }

  it("edits a term in place and disables Value for a kind that takes none", () => {
    const onChange = jest.fn();
    render(BRAND, onChange);

    const valueOfDnt = host.querySelector<HTMLInputElement>('input[aria-label="Value 2"]');
    expect(valueOfDnt?.disabled).toBe(true);

    const term = host.querySelector<HTMLInputElement>('input[aria-label="Term 1"]');
    expect(term).not.toBeNull();
    typeInto(term as HTMLInputElement, "AI Matrx Inc");
    expect(onChange).toHaveBeenLastCalledWith([
      { term: "AI Matrx Inc", value: "A-I May-tricks", kind: "pronounce" },
      BRAND[1],
    ]);
  });

  it("adds and removes rows", () => {
    const onChange = jest.fn();
    render(BRAND, onChange);
    act(() => button("Add row").click());
    expect(onChange).toHaveBeenLastCalledWith([...BRAND, { term: "", kind: "translate" }]);
    act(() => button("Remove row 1").click());
    expect(onChange).toHaveBeenLastCalledWith([BRAND[1]]);
  });

  it("appends pasted CSV rows and reports what it skipped", () => {
    const onChange = jest.fn();
    render(BRAND, onChange);
    act(() => button("Paste CSV").click());

    const area = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="CSV rows"]');
    expect(area).not.toBeNull();
    typeInto(area as HTMLTextAreaElement, "pickup,recogida,,es\nR2v3,,shout");
    expect(host.querySelector('[data-testid="csv-preview"]')?.textContent).toContain(
      "1 rows ready, 1 will be skipped",
    );

    act(() => button("Add rows").click());
    expect(onChange).toHaveBeenLastCalledWith([
      ...BRAND,
      { term: "pickup", value: "recogida", kind: "translate", language: "es" },
    ]);
    expect(toastCalls[0]).toMatch(/^warning:Added 1 rows; skipped 1: line 2/);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});
