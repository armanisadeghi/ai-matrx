import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SmartToastCard,
  TOAST_LONG_SAMPLE,
  ToastSystemSpecimen,
  buildToastAiPayload,
  type SmartToastOptions,
} from "./toast-system";

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

describe("ToastSystemSpecimen", () => {
  let container: HTMLDivElement;
  let root: Root;
  const writeText = jest.fn<Promise<void>, [string]>(() => Promise.resolve());

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root.render(
        <TooltipProvider>
          <ToastSystemSpecimen />
        </TooltipProvider>,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("gives every toast a message, exactly ONE copy affordance and a close button", () => {
    const toasts = container.querySelectorAll("[data-toast-kind]");
    expect(toasts.length).toBeGreaterThanOrEqual(8);
    toasts.forEach((t) => {
      const copy = t.querySelectorAll('[aria-label="Copy for AI"]').length;
      const alchemy = t.querySelectorAll("[data-error-alchemy-menu]").length;
      // An error's copy affordance is the Alchemy Menu; every other kind's is Copy for AI.
      if (t.getAttribute("data-toast-kind") === "error") expect([copy, alchemy]).toEqual([0, 1]);
      else expect([copy, alchemy]).toEqual([1, 0]);
      expect(t.querySelector('[aria-label="Close"]')).not.toBeNull();
    });
  });

  it("copies the AI envelope for the clicked toast and shows the exact text", async () => {
    const warningToast = container.querySelector('[data-toast-kind="warning"]')!;
    const copy = warningToast.querySelector<HTMLButtonElement>('[aria-label="Copy for AI"]')!;
    await act(async () => {
      copy.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('<toast tone="warning">');
    expect(text).toContain("Warning message");
    expect(text).toContain(`<route>${window.location.pathname}</route>`);
    expect(text).toContain("<shown_at>");
    expect(text).toContain('"specimen": "warning"');
    expect(container.querySelector('[data-testid="toast-ai-payload"]')!.textContent).toBe(text);
  });

  it("links a detail route into a new tab, never the current page", () => {
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Open in new tab"]')!;
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("carries aiContext, detail and route in the payload", () => {
    const text = buildToastAiPayload("success", "Note saved", {
      aiContext: { noteId: "n1" },
      detail: { title: "Note saved", rows: [{ label: "Revision", value: "14" }] },
      href: "/notes",
    });
    expect(text).toContain('"noteId": "n1"');
    expect(text).toContain('"detail_route": "/notes"');
    expect(text).toContain('"Revision"');
  });
});

describe("SmartToastCard at 240px", () => {
  let container: HTMLDivElement;
  let root: Root;
  const realRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    // jsdom computes no layout: give the card the width it would have, and
    // the message the overflow a 2-line clamp produces for a long text.
    jest.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if (this.hasAttribute("data-toast-kind")) return { ...realRect.call(this), width: 240 } as DOMRect;
      return realRect.call(this);
    });
    jest.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains("line-clamp-2")) return 0;
      return (this.textContent ?? "").length > 40 ? 72 : 36;
    });
    jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("line-clamp-2") ? 36 : 0;
    });
    container = document.createElement("div");
    container.style.width = "240px";
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  const render = (message: string, options: SmartToastOptions) =>
    act(() =>
      root.render(
        <TooltipProvider>
          <SmartToastCard kind="success" message={message} options={options} onClose={() => {}} />
        </TooltipProvider>,
      ),
    );

  it("folds the optional layers into one More button so copy, close and more fit on one row", () => {
    render(TOAST_LONG_SAMPLE, {
      detail: { title: "Note saved", rows: [{ label: "Revision", value: "14" }] },
      window: true,
      href: "/notes",
    });
    const card = container.querySelector("[data-toast-kind]")!;
    expect(card.hasAttribute("data-toast-narrow")).toBe(true);
    const controls = card.querySelector("[data-toast-controls]")!;
    expect(controls.className).toContain("flex-nowrap");
    expect(controls.className).toContain("shrink-0");
    const labels = Array.from(controls.querySelectorAll("[aria-label]")).map((b) => b.getAttribute("aria-label"));
    expect(labels).toEqual(["More", "Copy for AI", "Close"]);
    expect(card.className).toContain("min-w-[240px]");
  });

  it("clamps the message to two lines and keeps the whole text reachable in the peek", () => {
    render(TOAST_LONG_SAMPLE, { href: "/notes" });
    const card = container.querySelector("[data-toast-kind]")!;
    const wrap = card.querySelector("[data-toast-message]")!;
    expect(wrap.className).toContain("min-w-0");
    expect(wrap.className).toContain("flex-1");
    const text = wrap.querySelector("p")!;
    expect(text.className).toContain("line-clamp-2");
    expect(text.textContent).toBe(TOAST_LONG_SAMPLE);
    // Clamped with no caller detail: the peek exists (the message opens it)
    // and the narrow card folds "Details" + "New tab" behind More.
    expect(wrap.className).toContain("cursor-pointer");
    const labels = Array.from(card.querySelectorAll("[data-toast-controls] [aria-label]")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["More", "Copy for AI", "Close"]);
  });

  it("keeps a short message with no extra layers to copy and close only", () => {
    render("Note saved", {});
    const labels = Array.from(container.querySelectorAll("[data-toast-controls] [aria-label]")).map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["Copy for AI", "Close"]);
  });
});
