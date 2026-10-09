/**
 * In a canvas tab an html artifact is an APP: the iframe fills the tab body
 * edge to edge with none of the chat card's controls (Expand / Collapse /
 * Open in canvas / Code). Outside the canvas the chat card is unchanged.
 *
 * Mount never publishes (rendered-output standard, ruling 1): a page shows once
 * its canvas item's version has been published, so these mount an artifact
 * whose version resolves to a published page.
 */
import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
async function mount(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return host;
}
const byText = (text: string) =>
  Array.from(host.querySelectorAll<HTMLElement>("*")).filter(
    (el) => el.children.length === 0 && el.textContent === text,
  );

const presentation = { value: null as null | Record<string, unknown> };

jest.mock("@ai-matrx/canvas/react", () => ({
  useCanvasPresentation: () => presentation.value,
}));
const mockUser = { id: "user-1" };
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: () => mockUser,
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({ selectUser: () => null }));
jest.mock("@/features/canvas/hooks/useCanvas", () => ({
  useCanvas: () => ({ open: jest.fn() }),
}));
jest.mock("@/features/html-pages/services/htmlPageService", () => ({
  HTMLPageService: {
    createPage: jest.fn(async () => ({ url: "https://mymatrx.com/p/page-1" })),
  },
}));
jest.mock("@/features/html-pages/services/canvasVersionPage", () => {
  const version = { id: "ci-1", version: 1, url: "https://mymatrx.com/p/page-1", html: null };
  return {
    resolveHtmlCanvasPage: jest.fn(async () => ({ shown: version, latest: version })),
    onHtmlVersionPublished: () => () => undefined,
  };
});
// The attach controls read the chat store; their own suite covers them.
jest.mock("@/features/html-pages/components/HtmlAttachToChat", () => ({
  HtmlAttachToChat: () => null,
}));
jest.mock("@ai-matrx/rich-content/code-block/CodeBlock", () => ({
  __esModule: true,
  default: () => <pre data-testid="code-block" />,
}));
jest.mock("@/components/errors/ErrorAlchemyMenu", () => ({
  ErrorAlchemyMenu: () => null,
}));

import HtmlArtifact from "../HtmlArtifact";
import { pageSandbox } from "@/features/html-pages/components/HtmlInlinePreview";

const DOC =
  "<!DOCTYPE html><html><head><title>Mini Reaction Lab</title></head><body><button>Mix</button></body></html>";

describe("html artifact in the canvas", () => {
  afterEach(() => {
    presentation.value = null;
  });

  it("fills the tab with a bare app frame and no chat controls", async () => {
    presentation.value = { host: "canvas", width: 630, height: 800 };
    await mount(<HtmlArtifact mode="canvas" data={DOC} isStreamActive={false} artifactId="ci-1" />);
    const frame = host.querySelector("iframe")!;
    expect(frame).not.toBeNull();
    expect(frame.className).toContain("h-full");
    expect(frame.className).toContain("w-full");
    expect(frame.getAttribute("title")?.length).toBeGreaterThan(0);
    expect(frame.hasAttribute("data-native-title")).toBe(true);
    expect(frame.getAttribute("loading")).toBeNull();
    const sandbox = frame.getAttribute("sandbox") ?? "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).toContain("allow-modals");
    expect(sandbox).toContain("allow-popups-to-escape-sandbox");
    expect(sandbox).not.toContain("allow-top-navigation");
    expect(byText("Expand")).toHaveLength(0);
    expect(host.querySelectorAll('[aria-label="Open in canvas"]')).toHaveLength(0);
    expect(host.querySelectorAll('[aria-label="Show code"]')).toHaveLength(0);
    expect(host.querySelectorAll("[data-html-preview-header]")).toHaveLength(0);
    // The frame is the body — no card wrapper around it.
    expect(frame.parentElement?.className ?? "").not.toContain("rounded-lg");
  });

  it("outside the canvas: ONE header with the page title and actions, a content-sized frame, no fade", async () => {
    presentation.value = null;
    await mount(<HtmlArtifact mode="canvas" data={DOC} isStreamActive={false} artifactId="ci-1" />);
    expect(host.querySelectorAll("[data-html-preview-header]")).toHaveLength(1);
    for (const label of ["Show code", "Copy HTML", "Download .html", "Open in canvas"]) {
      expect(host.querySelectorAll(`[aria-label="${label}"]`)).toHaveLength(1);
    }
    expect(byText("Expand")).toHaveLength(0);
    const frame = host.querySelector<HTMLIFrameElement>("iframe[data-html-inline-frame]");
    expect(frame).not.toBeNull();
    expect(frame?.style.maxHeight).toContain("min(");
    expect(host.querySelector(".bg-gradient-to-t")).toBeNull();
  });
});

describe("pageSandbox", () => {
  const base = "allow-scripts allow-same-origin allow-forms";

  it("keeps allow-same-origin for the separate html site", () => {
    expect(pageSandbox("https://mymatrx.com/p/1", base, "https://aimatrx.com")).toBe(base);
  });

  it("drops allow-same-origin when the page would share the app's origin", () => {
    expect(pageSandbox("https://aimatrx.com/p/1", base, "https://aimatrx.com")).toBe(
      "allow-scripts allow-forms",
    );
    expect(pageSandbox("/p/1", base, "https://aimatrx.com")).toBe("allow-scripts allow-forms");
  });
});
