/**
 * @jest-environment jsdom
 *
 * G1 — THE LEAK SENTINEL. Whatever path drew it, a `__kind` key that reaches
 * the screen as text outside an explicit source container is reported (once
 * per place), and nothing else is: text inside `data-kind-source`, kindless
 * JSON, prose naming the key.
 */

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { installKindLeakSentinel, resetKindLeakSentinelReports } from "../surfaces/kind-leak-sentinel";
import { KIND_SOURCE_ATTR } from "../surfaces/kind-leak-scan";

const KIND = '{"__kind":"flashcard_set","title":"Cells","cards":[]}';
const capture = captureError as jest.Mock;

async function settle() {
  jest.advanceTimersByTime(1000);
  await Promise.resolve();
}

describe("the kind leak sentinel (G1)", () => {
  let dispose: () => void;
  beforeEach(() => {
    jest.useFakeTimers();
    capture.mockClear();
    resetKindLeakSentinelReports();
    document.body.innerHTML = "";
    dispose = installKindLeakSentinel({ root: document.body, debounceMs: 100, logToConsole: false });
  });
  afterEach(() => {
    dispose();
    jest.useRealTimers();
  });

  it("reports a kind drawn as text in an unmarked node", async () => {
    const p = document.createElement("p");
    p.className = "answer-prose";
    p.textContent = `Here are your cards: ${KIND}`;
    const card = document.createElement("div");
    card.setAttribute("data-block-type", "text");
    card.appendChild(p);
    document.body.appendChild(card);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
    const report = capture.mock.calls[0][0];
    expect(report.source).toBe("content-ir");
    expect(report.relation).toBe("flashcard_set");
    expect(JSON.stringify(report.raw)).toContain("data-block-type");
    expect(JSON.stringify(report.raw)).toContain("answer-prose");
  });

  it("reports a key split across highlighted spans", async () => {
    document.body.innerHTML = '<pre><span>{</span><span>"__kind"</span><span>:</span><span>"note"</span>}</pre>';
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("reports text that CHANGES into a leak (characterData)", async () => {
    const p = document.createElement("p");
    p.textContent = "loading";
    document.body.appendChild(p);
    await settle();
    expect(capture).not.toHaveBeenCalled();
    p.firstChild!.nodeValue = KIND;
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("reports once per place, not once per mutation", async () => {
    const p = document.createElement("p");
    p.textContent = KIND;
    document.body.appendChild(p);
    await settle();
    p.textContent = `${KIND} `;
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("stays silent inside an explicit source container", async () => {
    const pane = document.createElement("div");
    pane.setAttribute(KIND_SOURCE_ATTR, "explicit");
    pane.innerHTML = `<pre><code>${KIND}</code></pre>`;
    document.body.appendChild(pane);
    await settle();
    expect(capture).not.toHaveBeenCalled();
  });

  it("stays silent for kindless JSON and prose naming the key", async () => {
    document.body.innerHTML = '<pre>{"name":"Ada","rows":[1,2]}</pre><p>The __kind key names the shape.</p><style>.x{}</style>';
    await settle();
    expect(capture).not.toHaveBeenCalled();
  });

  it("finds a leak already on the page at install (initial scan)", async () => {
    dispose();
    document.body.innerHTML = `<div><p>${KIND}</p></div>`;
    dispose = installKindLeakSentinel({ root: document.body, debounceMs: 100, logToConsole: false });
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("never throws when captureError does", async () => {
    capture.mockImplementationOnce(() => {
      throw new Error("sink down");
    });
    const p = document.createElement("p");
    p.textContent = KIND;
    document.body.appendChild(p);
    await expect(settle()).resolves.toBeUndefined();
  });
});
