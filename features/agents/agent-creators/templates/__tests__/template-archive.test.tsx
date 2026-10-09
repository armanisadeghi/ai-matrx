/**
 * Archive/restore on agent templates: the card offers Archive only when the host says the person may
 * edit it, Restore on an archived card, and nothing when no handler is wired (absent, never dead).
 * The confirm copy is the "Keep it / Archive it" pair and promises no permanence.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TemplateCard } from "../TemplateCard";
import { buildTemplateArchiveConfirm } from "../templateArchive";

jest.mock("next/link", () => ({ __esModule: true, default: (p: { children: React.ReactNode }) => <a>{p.children}</a> }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const base = { id: "t1", name: "QME Report", description: null, category: null, isFeatured: false, useCount: 0 };
const btn = (label: string) => host.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;

describe("template card archive control", () => {
  it("offers Archive and fires it with id and name", () => {
    const onArchive = jest.fn();
    act(() => root.render(<TemplateCard {...base} onArchive={onArchive} />));
    expect(btn("Restore template")).toBeNull();
    act(() => btn("Archive template")!.click());
    expect(onArchive).toHaveBeenCalledWith("t1", "QME Report");
  });
  it("offers Restore, not Archive, on an archived card", () => {
    const onRestore = jest.fn();
    act(() => root.render(<TemplateCard {...base} isArchived onArchive={jest.fn()} onRestore={onRestore} />));
    expect(btn("Archive template")).toBeNull();
    act(() => btn("Restore template")!.click());
    expect(onRestore).toHaveBeenCalledWith("t1", "QME Report");
  });
  it("renders no control when the person may not edit (no handlers)", () => {
    act(() => root.render(<TemplateCard {...base} />));
    expect(btn("Archive template")).toBeNull();
    expect(btn("Restore template")).toBeNull();
  });
});

describe("archive confirm copy", () => {
  it("is Keep it / Archive it and never claims permanence", () => {
    const c = buildTemplateArchiveConfirm("QME Report");
    expect(c.cancelLabel).toBe("Keep it");
    expect(c.confirmLabel).toBe("Archive it");
    expect(c.description).toMatch(/restore/i);
    expect(c.description).not.toMatch(/permanent|cannot be undone/i);
  });
});
