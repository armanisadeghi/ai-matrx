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
import * as scan from "../surfaces/kind-leak-scan";

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

  // H2 (round 5): a per-scan character cap must never decide what is seen.
  const FILLER = "Plain sentence about cell biology and nothing structured at all here. ".repeat(2).slice(0, 100);
  function longList(items: number): HTMLElement {
    const list = document.createElement("ul");
    for (let i = 0; i < items; i += 1) {
      const li = document.createElement("li");
      li.textContent = `${i}: ${FILLER}`;
      list.appendChild(li);
    }
    return list;
  }
  async function drain() {
    for (let i = 0; i < 200; i += 1) await settle();
  }

  it("H2a: finishes the initial page scan past any per-slice cap (content before mount)", async () => {
    dispose();
    const list = longList(2_500); // ~260k characters before the leak
    const last = document.createElement("li");
    last.textContent = KIND;
    list.appendChild(last);
    document.body.appendChild(list);
    dispose = installKindLeakSentinel({ root: document.body, debounceMs: 100, logToConsole: false });
    await drain();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("H2a: a node appended to the END of a long list is scanned (only what changed)", async () => {
    const list = longList(2_500);
    document.body.appendChild(list);
    await drain();
    expect(capture).not.toHaveBeenCalled();
    const li = document.createElement("li");
    li.textContent = KIND;
    list.appendChild(li);
    await drain();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("H2: appending to a long list reads the change, not the list (cost)", async () => {
    const list = longList(2_500);
    document.body.appendChild(list);
    await drain();
    const spy = jest.spyOn(scan, "visibleKindText");
    const li = document.createElement("li");
    li.textContent = "One more plain row.";
    list.appendChild(li);
    await drain();
    const read = spy.mock.results.reduce((sum, r) => sum + String(r.value).length, 0);
    const calls = spy.mock.calls.length;
    spy.mockRestore();
    expect(calls).toBeGreaterThan(0); // the spy sees the sentinel's reads
    expect(read).toBeLessThan(2_000);
  });

  it("H2b: a big kindless addition never drops the other pending additions", async () => {
    const big = document.createElement("div");
    big.textContent = FILLER.repeat(2_600); // ~260k characters, one text node
    document.body.appendChild(big);
    const p = document.createElement("p");
    p.textContent = KIND;
    document.body.appendChild(p);
    await drain();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("H2: an appended token completes a key split across sibling text nodes", async () => {
    const p = document.createElement("p");
    for (const token of ['{"', "__", "ki"]) p.appendChild(document.createTextNode(token));
    document.body.appendChild(p);
    await settle();
    expect(capture).not.toHaveBeenCalled();
    for (const token of ['nd"', ":", '"note"}']) {
      p.appendChild(document.createTextNode(token));
      await settle();
    }
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
  // ── R3, round 6 ─────────────────────────────────────────────────────────
  const ESCAPED = '{"answer":"{\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"Cells\\"}"}';

  it("R3i: reports an ESCAPED kind key on screen (a raw view of a string-held kind)", async () => {
    const pre = document.createElement("pre");
    pre.textContent = ESCAPED;
    document.body.appendChild(pre);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].relation).toBe("flashcard_set");
  });

  it("R3i: an escaped key inside a marked source view stays silent", async () => {
    const pane = document.createElement("div");
    pane.setAttribute(KIND_SOURCE_ATTR, "explicit");
    pane.innerHTML = "<pre></pre>";
    pane.firstElementChild!.textContent = ESCAPED;
    document.body.appendChild(pane);
    await settle();
    expect(capture).not.toHaveBeenCalled();
  });

  it.each(["title", "aria-label", "alt"])("R3ii: reports a kind in a %s attribute", async (attr) => {
    const el = document.createElement(attr === "alt" ? "img" : "span");
    el.className = `attr-${attr}`;
    el.setAttribute(attr, `Skill: ${KIND}`);
    document.body.appendChild(el);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].raw.attribute).toBe(attr);
  });

  it("R3ii: later attribute leaks on new nodes are each reported", async () => {
    const seen: string[] = [];
    for (const attr of ["title", "aria-label", "alt"]) {
      const el = document.createElement(attr === "alt" ? "img" : "span");
      el.setAttribute(attr, KIND);
      document.body.appendChild(el);
      await settle();
      seen.push(...capture.mock.calls.map((call) => String(call[0].raw.attribute)));
      capture.mockClear();
    }
    expect(seen).toEqual(["title", "aria-label", "alt"]);
  });

  it("R3ii: reports a title attribute that CHANGES into a leak", async () => {
    const el = document.createElement("button");
    el.setAttribute("title", "Run");
    document.body.appendChild(el);
    await settle();
    expect(capture).not.toHaveBeenCalled();
    el.setAttribute("title", KIND);
    await settle();
    expect(capture).toHaveBeenCalledTimes(1);
  });

  it("R3ii: attributes inside a marked source view, and kindless attributes, stay silent", async () => {
    document.body.innerHTML = `<div ${KIND_SOURCE_ATTR}="explicit"><span title='${KIND}'>x</span></div><span title="The __kind key">y</span>`;
    await settle();
    expect(capture).not.toHaveBeenCalled();
  });

  it("R3iii: every contenteditable editor (plaintext-only too) is the person's own input — skipped", async () => {
    document.body.innerHTML = `<div contenteditable="plaintext-only">${KIND}</div><div contenteditable="">${KIND}</div><textarea>${KIND}</textarea>`;
    await settle();
    expect(capture).not.toHaveBeenCalled();
  });
});
