/**
 * The on-screen write guard's refusal is written for the MODEL; the card the
 * PERSON sees is a quiet routed-state line — never "failed", never the record
 * id, never a tool name (PB-01 run 4, conversation 9fcf3382, 2026-10-01: the
 * card read "Note save failed · Record on screen: Refused: this note (59678b3b-…)
 * … note:patch … apply_surface_write …").
 *
 * The header test renders the REAL ToolCallVisualization with the REAL
 * registry phase label for `note` and the REAL ToolErrorCard; only the
 * redux/overlay/glyph plumbing is stubbed.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ToolLifecycleEntry } from "../../../agents/types/request.types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

jest.mock("../../../store/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  // correctedIds (a Set), suspended ids (not an array), display pref (no match).
  useAppSelector: () => new Set<string>(),
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("../../db-renderer/useDbToolMeta", () => ({
  useDbToolRendererState: () => ({ resolution: "static" }),
}));
jest.mock("../../db-renderer/toolRendererCache", () => ({
  prefetchToolRenderer: jest.fn(),
  getCachedToolRenderer: () => null,
  getCachedToolMeta: () => null,
  isKnownNoToolRenderer: () => true,
}));

import { ToolErrorCard, toolErrorLabel } from "../ToolErrorCard";
import { guardRoutingOf } from "../guard-routing";
import { ToolCallVisualization } from "../../components/ToolCallVisualization";

const NOTE_ID = "59678b3b-3620-442d-872b-0331ac74a1cf";
// Verbatim from aidream on_screen_write_guard.py for this run.
const ON_SCREEN_MESSAGE =
  `Refused: this note (${NOTE_ID}) is open on the person's screen, so note:patch cannot change it directly. ` +
  "Nothing was changed. Propose the change with apply_surface_write (target note_content, append_to_note) so they can confirm it.";
const DECLINED_MESSAGE =
  `Refused: the person declined a change to this note (${NOTE_ID}) in this turn. ` +
  "Nothing was changed. Do not write it with note:patch or any other tool.";

function entry(errorType: string | null, errorMessage: string | null): ToolLifecycleEntry {
  return {
    callId: "call-guard",
    toolName: "note",
    displayName: "note",
    status: "error",
    arguments: { action: "patch", note_id: NOTE_ID },
    startedAt: "2026-10-01T14:27:40.000Z",
    completedAt: "2026-10-01T14:27:41.000Z",
    latestMessage: null,
    latestData: null,
    result: null,
    resultPreview: null,
    errorType,
    errorMessage,
    isDelegated: false,
    events: [],
  };
}

const FORBIDDEN = [/fail/i, /refused/i, new RegExp(NOTE_ID.slice(0, 8)), /apply_surface_write/, /note:patch/, /record on screen/i];

function expectQuiet(text: string) {
  for (const pattern of FORBIDDEN) expect(text).not.toMatch(pattern);
}

describe("guard refusals render as a routed state, not a failure", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("maps record_on_screen and person_declined_this_change within the text budgets", () => {
    const onScreen = guardRoutingOf(entry("record_on_screen", ON_SCREEN_MESSAGE));
    expect(onScreen?.label).toBe("Change routed to the open note");
    const declined = guardRoutingOf(entry("person_declined_this_change", DECLINED_MESSAGE));
    expect(declined?.label).toBe("Kept the note as you left it");
    for (const r of [onScreen!, declined!]) {
      expect(r.label.length).toBeLessThanOrEqual(60);
      expect(r.tooltip.length).toBeLessThanOrEqual(140);
      expectQuiet(`${r.label} ${r.tooltip}`);
    }
    // Any other error is not a guard routing.
    expect(guardRoutingOf(entry("validation", "table_id is required."))).toBeNull();
    expect(toolErrorLabel(entry("record_on_screen", ON_SCREEN_MESSAGE))).toBe(
      "Change routed to the open note",
    );
  });

  it("the inline card shows the state line with a tooltip and none of the model's sentence", () => {
    act(() => root.render(<ToolErrorCard entry={entry("record_on_screen", ON_SCREEN_MESSAGE)} />));
    const text = container.textContent ?? "";
    expect(text).toContain("Change routed to the open note");
    expectQuiet(text);
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe(
      "This note is open on your screen, so the change comes to you to confirm.",
    );
  });

  it("the tool card header never says the note save failed", () => {
    act(() =>
      root.render(
        <ToolCallVisualization entries={[entry("record_on_screen", ON_SCREEN_MESSAGE)]} />,
      ),
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Change routed to the open note");
    expectQuiet(text);
  });

  it("an ordinary note error still reads as a failure (the mapping is not a blanket mute)", () => {
    act(() =>
      root.render(
        <ToolCallVisualization entries={[entry("database_error", "connection reset")]} />,
      ),
    );
    expect(container.textContent ?? "").toMatch(/Note save failed/);
  });
});
