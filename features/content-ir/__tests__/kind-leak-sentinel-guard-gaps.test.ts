/**
 * @jest-environment jsdom
 *
 * Round 8 (R8-3) — three places the sentinel and the DOM frame judge could
 * not see a kind on screen:
 *
 *   (a) a READ-ONLY or DISABLED field's `value` (a person reads it; nobody
 *       types it) — an editable field stays skipped (the person's own input);
 *   (b) the `data-kind-source` attribute itself — removing it at runtime must
 *       re-scan that subtree;
 *   (c) an iframe `srcdoc` built from agent content (HTML previews,
 *       artifacts) — the string is read when it is set; never the frame's
 *       document (no cross-origin access, ever).
 */

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { installKindLeakSentinel, resetKindLeakSentinelReports } from "../surfaces/kind-leak-sentinel";
import { domLeaksKind, KIND_SOURCE_ATTR } from "../surfaces/kind-leak-scan";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[]}';
const capture = captureError as jest.Mock;

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}
async function settle() {
  await flushMicrotasks();
  jest.advanceTimersByTime(1000);
  await flushMicrotasks();
}

function field(tag: "textarea" | "input", mode: "readonly" | "disabled" | "editable"): HTMLTextAreaElement | HTMLInputElement {
  const el = document.createElement(tag);
  el.value = `Saved answer: ${KIND}`;
  if (mode === "readonly") el.readOnly = true;
  if (mode === "disabled") el.disabled = true;
  return el;
}

describe("R8-3 guard gaps — the DOM frame judge", () => {
  it.each([
    ["textarea", "readonly", true],
    ["textarea", "disabled", true],
    ["input", "readonly", true],
    ["input", "disabled", true],
    ["textarea", "editable", false],
    ["input", "editable", false],
  ] as const)("(a) a %s that is %s: leak = %s", (tag, mode, leaks) => {
    const host = document.createElement("div");
    host.appendChild(field(tag, mode));
    expect(domLeaksKind(host)).toBe(leaks);
  });

  it("(a) a read-only field inside a marked source view is silent", () => {
    const host = document.createElement("div");
    host.setAttribute(KIND_SOURCE_ATTR, "explicit");
    host.appendChild(field("textarea", "readonly"));
    const outer = document.createElement("div");
    outer.appendChild(host);
    expect(domLeaksKind(outer)).toBe(false);
  });

  it("(a) a read-only field marked as a source view itself is silent", () => {
    const el = field("textarea", "readonly");
    el.setAttribute(KIND_SOURCE_ATTR, "explicit");
    const host = document.createElement("div");
    host.appendChild(el);
    expect(domLeaksKind(host)).toBe(false);
  });

  it.each([
    ["body text", `<p>Here: ${KIND}</p>`, true],
    ["entity-escaped body text", `<p>Here: ${KIND.replaceAll('"', "&quot;")}</p>`, true],
    ["a script's data only", `<script>window.data = ${KIND}</script><p>Chart</p>`, false],
    ["kindless", "<p>Hello</p>", false],
  ] as const)("(c) an iframe srcdoc with %s: leak = %s", (_label, html, leaks) => {
    const host = document.createElement("div");
    const frame = document.createElement("iframe");
    frame.setAttribute("srcdoc", html);
    host.appendChild(frame);
    expect(domLeaksKind(host)).toBe(leaks);
  });

  it("(c) a marked iframe (a deliberate source preview) is silent", () => {
    const host = document.createElement("div");
    const frame = document.createElement("iframe");
    frame.setAttribute("srcdoc", `<p>${KIND}</p>`);
    frame.setAttribute(KIND_SOURCE_ATTR, "explicit");
    host.appendChild(frame);
    expect(domLeaksKind(host)).toBe(false);
  });
});

describe("R8-3 guard gaps — the runtime sentinel", () => {
  let dispose: () => void;
  beforeEach(async () => {
    jest.useFakeTimers();
    capture.mockClear();
    resetKindLeakSentinelReports();
    document.body.innerHTML = "";
    dispose = installKindLeakSentinel({ root: document.body, debounceMs: 100, logToConsole: false });
    await settle();
  });
  afterEach(() => {
    dispose();
    jest.useRealTimers();
  });

  it("(a) reports a read-only textarea added holding a kind", async () => {
    const host = document.createElement("div");
    host.appendChild(field("textarea", "readonly"));
    document.body.appendChild(host);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("(a) reports a field that BECOMES read-only holding a kind", async () => {
    const el = field("textarea", "editable");
    document.body.appendChild(el);
    await settle();
    expect(capture).not.toHaveBeenCalled();
    el.readOnly = true;
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("(a) an editable field holding a kind is never reported", async () => {
    document.body.appendChild(field("input", "editable"));
    await settle();
    expect(capture).not.toHaveBeenCalled();
  });

  it("(b) removing data-kind-source at runtime re-scans that subtree", async () => {
    const view = document.createElement("pre");
    view.setAttribute(KIND_SOURCE_ATTR, "explicit");
    view.textContent = KIND;
    document.body.appendChild(view);
    await settle();
    expect(capture).not.toHaveBeenCalled();
    view.removeAttribute(KIND_SOURCE_ATTR);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("(c) reports an iframe added with a kind in its srcdoc", async () => {
    const frame = document.createElement("iframe");
    frame.setAttribute("srcdoc", `<p>Here: ${KIND}</p>`);
    document.body.appendChild(frame);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("(c) reports a srcdoc that CHANGES into a leak", async () => {
    const frame = document.createElement("iframe");
    frame.setAttribute("srcdoc", "<p>Loading</p>");
    document.body.appendChild(frame);
    await settle();
    expect(capture).not.toHaveBeenCalled();
    frame.setAttribute("srcdoc", `<p>Here: ${KIND}</p>`);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });
});

describe("R8-3 (d) two raw views", () => {
  const read = (path: string) =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("fs") as typeof import("fs")).readFileSync(require("path").join(process.cwd(), path), "utf8");

  it("TextSectionsWindow's Raw view is a marked source view", () => {
    const source = read("features/window-panels/windows/text-sections/TextSectionsWindow.tsx");
    const raw = source.slice(source.indexOf('view === "raw" || view === "split"'));
    expect(raw.slice(0, 600)).toMatch(/\{\.\.\.KIND_SOURCE_PROPS\}/);
  });

  it("StructuredAgentAnswerBlock's Details never prints a kind raw — the value door draws it", () => {
    const source = read("components/mardown-display/blocks/json/StructuredAgentAnswerBlock.tsx");
    const details = source.slice(source.indexOf("<details"));
    expect(details).toMatch(/valueCarriesKind\(value\)/);
    expect(details).toMatch(/<AnswerValueView value=\{value\}/);
  });
});
