import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastSystemSpecimen, buildToastAiPayload } from "./toast-system";

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

  it("gives every toast a message, a Copy for AI button and a close button", () => {
    const toasts = container.querySelectorAll("[data-toast-kind]");
    expect(toasts.length).toBeGreaterThanOrEqual(8);
    toasts.forEach((t) => {
      expect(t.querySelector('[aria-label="Copy for AI"]')).not.toBeNull();
      expect(t.querySelector('[aria-label="Close"]')).not.toBeNull();
    });
  });

  it("copies the AI envelope for the clicked toast and shows the exact text", async () => {
    const errorToast = container.querySelector('[data-toast-kind="error"]')!;
    const copy = errorToast.querySelector<HTMLButtonElement>('[aria-label="Copy for AI"]')!;
    await act(async () => {
      copy.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('<toast tone="error">');
    expect(text).toContain("Error message");
    expect(text).toContain(`<route>${window.location.pathname}</route>`);
    expect(text).toContain("<shown_at>");
    expect(text).toContain('"specimen": "error"');
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
