/**
 * THE WRITE REPORTS ON ITSELF, AND THE SCREEN PRINTS WHAT IT SAID.
 *
 * 🚨 The defect this exists for: `set_binding` refuses an auto-run promise DOWN
 * TO FALSE when the mapping still asks the person something, and until aidream
 * v0.2.456 the only record of that was a `logger.warning` on the server. The
 * caller got a 200 whose `auto_run` was the opposite of what it sent, and the
 * author of the binding was told nothing (V3-CORRECTNESS F5). The server now
 * returns the refusal as prose on `BindingResult.notes`, plus one sentence on
 * `.applies_in` saying where the row it wrote actually answers — and the client
 * had no reader for either: `putMandateBinding` returned `Promise<void>` and
 * threw the whole body away.
 *
 * Two halves are pinned here, because both can regress independently:
 *   1. the PARSER keeps the server's sentences verbatim and invents nothing
 *      when an older server answers without them;
 *   2. the BAR prints them, beside — never instead of — its own pre-save
 *      preview of the draft.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { parseBindingWriteReport } from "@/features/mandates/overrides";
import { AutoRunBar } from "../AutoRunBar";
import type { ConsumptionMap } from "@/features/mandates/provision-shapes";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The server's real sentence, as `_storable_auto_run` writes it. */
const REFUSAL =
  '"Run instantly" was refused and stored as off: this mapping asks the ' +
  "person for topic, so there is something to ask.";

const APPLIES_IN =
  "You, in every organization you work in. A personal binding follows the person.";

describe("parseBindingWriteReport — the server's words, or nothing", () => {
  it("keeps notes and applies_in verbatim", () => {
    const report = parseBindingWriteReport({
      id: "b1",
      applies_in: APPLIES_IN,
      notes: [REFUSAL],
    });
    expect(report.notes).toEqual([REFUSAL]);
    expect(report.appliesIn).toBe(APPLIES_IN);
  });

  it("reads a server that predates the fields as having said nothing", () => {
    const report = parseBindingWriteReport({ id: "b1", created: true });
    expect(report.notes).toEqual([]);
    // 🚨 NOT an empty string that a `{appliesIn ? …}` render would treat as a
    // sentence — absent must read as absent.
    expect(report.appliesIn).toBeNull();
  });

  it("drops non-sentences rather than printing them", () => {
    const report = parseBindingWriteReport({
      applies_in: "   ",
      notes: [REFUSAL, "", "   ", 42, null],
    });
    expect(report.notes).toEqual([REFUSAL]);
    expect(report.appliesIn).toBeNull();
  });

  it("survives a body that is not an object at all", () => {
    expect(parseBindingWriteReport(null)).toEqual({ notes: [], appliesIn: null });
    expect(parseBindingWriteReport("nope")).toEqual({
      notes: [],
      appliesIn: null,
    });
  });
});

describe("AutoRunBar — the server's note beside the draft's preview", () => {
  let container: HTMLDivElement;
  let root: Root;

  const MAP: ConsumptionMap = {
    topic: [{ mapType: "prompt_user", prompt: "Which topic?" }],
  };
  const TARGETS = [{ name: "topic", required: true }] as never;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("prints nothing extra before a save has happened", () => {
    act(() => {
      root.render(
        <AutoRunBar
          targets={TARGETS}
          map={MAP}
          value={null}
          onChange={() => undefined}
        />,
      );
    });
    expect(container.textContent).toContain("Waits for you to press Run");
    expect(container.textContent).not.toContain("What the save did");
  });

  it("prints the server's refusal VERBATIM, keeping its own preview sentence", () => {
    act(() => {
      root.render(
        <AutoRunBar
          targets={TARGETS}
          map={MAP}
          value={null}
          onChange={() => undefined}
          serverNotes={[REFUSAL]}
        />,
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain(REFUSAL);
    // The client-derived sentence is the PRE-SAVE preview and stays put — the
    // server's note is about the stored row, not about the draft on screen.
    expect(text).toContain("Waits for you to press Run");
  });
});
