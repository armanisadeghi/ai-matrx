/**
 * 🚨 FOCUS NEVER MOVES THE PAGE (cold walk 23, defect B + its Rulebook sibling).
 *
 * A run's own address, `/masterwork/encore/<id>?run=<runId>`, landed with
 * "Your result" 2,395px ABOVE the viewport (4,524px at 390×844): the run box's
 * text fields mounted with the `autoFocus` attribute, the browser scrolled the
 * page to the focused field, and the Expert saw an empty form instead of her
 * result. The Rulebook page at 390×844 opened scrolled 1,026px down for the
 * same reason (its Understudy card renders the same served form).
 *
 * Two legs, both at the shared layer every host inherits:
 *   1. the text input, when a host DOES ask for focus, focuses with
 *      `preventScroll` — focus is given, the page does not move;
 *   2. a served form (the run box, the Understudy form) never takes focus on
 *      mount at all — it sits inside a page that is about something else.
 *
 * PROVEN FAILING FIRST: against the pre-fix files leg 1 records a focus call
 * without `preventScroll`, and leg 2 records a mount-time focus.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

// The text control itself is a different subsystem (voice, agent menu, redux).
// Stood in by a plain textarea that forwards its ref and every prop — so a
// mount-time `autoFocus` attribute behaves exactly as the browser's would.
jest.mock("@host/components/official/ProTextarea", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require("react") as typeof React;
  const ProTextarea = R.forwardRef<HTMLTextAreaElement, Record<string, unknown>>(
    (
      {
        appendTranscript: _a,
        onEnterKey: _e,
        onRequestClose: _r,
        protectTranscription: _p,
        onTranscriptionComplete: _c,
        onTranscriptionError: _x,
        ...rest
      },
      ref,
    ) => R.createElement("textarea", { ...rest, ref }),
  );
  return { ProTextarea };
});
jest.mock("../../../../../host/notify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

// The modules under test can be swapped for a pre-fix copy to prove this
// suite fails without the fix (same seam as a-date-shows-in-a-date-and-time-input).
/* eslint-disable @typescript-eslint/no-require-imports */
const { TextareaInput } = require(
  process.env.TEXTAREA_INPUT_UNDER_TEST ?? "../TextareaInput",
) as typeof import("../TextareaInput");
const { ServedFieldControl } = require(
  process.env.SERVED_FIELDS_UNDER_TEST ??
    "@host/features/workflow-runtime/served-form/ServedInputFields",
) as typeof import("@host/features/workflow-runtime/served-form/ServedInputFields");
/* eslint-enable @typescript-eslint/no-require-imports */
import { parseServedInput } from "@host/features/workflow-runtime/served-form/served-input";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

type FocusCall = { tag: string; options: FocusOptions | undefined };

function recordFocus(): { calls: FocusCall[]; restore: () => void } {
  const calls: FocusCall[] = [];
  const original = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function (this: HTMLElement, options?: FocusOptions) {
    calls.push({ tag: this.tagName, options });
    return original.call(this, options);
  };
  return { calls, restore: () => (HTMLElement.prototype.focus = original) };
}

async function mount(node: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return async () => {
    await act(async () => root.unmount());
    host.remove();
  };
}

it("a text input asked for focus takes it without scrolling the page", async () => {
  const focus = recordFocus();
  try {
    const unmount = await mount(
      <TextareaInput value="" onChange={() => undefined} variableName="The text (verbatim)" autoFocus />,
    );
    const textareaFocus = focus.calls.filter((c) => c.tag === "TEXTAREA");
    expect(textareaFocus.length).toBeGreaterThan(0);
    for (const call of textareaFocus) expect(call.options?.preventScroll).toBe(true);
    await unmount();
  } finally {
    focus.restore();
  }
});

it("a served form field never takes focus when its page mounts", async () => {
  const input = parseServedInput({
    name: "document",
    kind: "text",
    label: "The text (verbatim)",
    placeholder: "Paste the text to check",
    sourcing: "require",
  });
  expect(input).not.toBeNull();
  const focus = recordFocus();
  try {
    const unmount = await mount(
      <ServedFieldControl input={input!} kind={undefined} value="" onChange={() => undefined} />,
    );
    expect(document.querySelector("textarea")).not.toBeNull();
    expect(focus.calls).toEqual([]);
    expect(document.activeElement?.tagName).not.toBe("TEXTAREA");
    await unmount();
  } finally {
    focus.restore();
  }
});

/**
 * Leg 3 — the "Other" free-text editors (SelectInput's three modes,
 * RadioGroupInput, CheckboxGroupInput). They mounted with the `autoFocus`
 * attribute, so a form restored with an "Other: …" answer focused that editor
 * on page load and the browser scrolled to it. Focus, when it is taken, never
 * scrolls. PROVEN FAILING FIRST: React's `autoFocus` calls `focus()` with no
 * options.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { SelectInput } = require("../SelectInput") as typeof import("../SelectInput");
const { RadioGroupInput } = require("../RadioGroupInput") as typeof import("../RadioGroupInput");
const { CheckboxGroupInput } = require("../CheckboxGroupInput") as typeof import("../CheckboxGroupInput");
/* eslint-enable @typescript-eslint/no-require-imports */

const OPTIONS = ["Recoat", "Resand", "Replace"];
const RESTORED_OTHER = "Other: screen and recoat the hallway only";

it.each([
  ["SelectInput (dropdown)", () => <SelectInput value={RESTORED_OTHER} onChange={() => undefined} options={OPTIONS} variableName="Verdict" allowOther />],
  ["SelectInput (expanded)", () => <SelectInput value={RESTORED_OTHER} onChange={() => undefined} options={OPTIONS} variableName="Verdict" allowOther expanded />],
  ["SelectInput (searchable)", () => <SelectInput value={RESTORED_OTHER} onChange={() => undefined} options={Array.from({ length: 14 }, (_, i) => `Grade ${i + 1}`)} variableName="Grade" allowOther />],
  ["RadioGroupInput", () => <RadioGroupInput value={RESTORED_OTHER} onChange={() => undefined} options={OPTIONS} variableName="Verdict" allowOther />],
  ["CheckboxGroupInput", () => <CheckboxGroupInput value={RESTORED_OTHER} onChange={() => undefined} options={OPTIONS} variableName="Verdicts" allowOther />],
])("%s: a restored 'Other' answer never scrolls the page to its editor", async (_name, render) => {
  const focus = recordFocus();
  try {
    const unmount = await mount(render());
    expect(document.querySelector("textarea")).not.toBeNull();
    for (const call of focus.calls.filter((c) => c.tag === "TEXTAREA")) {
      expect(call.options?.preventScroll).toBe(true);
    }
    await unmount();
  } finally {
    focus.restore();
  }
});

/**
 * Leg 4 — the composer's own textarea (AgentTextarea) defaults `autoFocus` on
 * and re-focuses on every conversation change, 100ms after mount. Rendering it
 * needs the whole execution store, so its focus call is held at the source:
 * every `.focus(` in it passes `preventScroll: true`, and every automatic
 * focus goes through `focusUnlessTypingElsewhere` with its default options —
 * which never scroll (checked on the helper itself below).
 */
it("the composer textarea focuses without scrolling the page", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  const source = readFileSync(
    require.resolve("../../smart-input/AgentTextarea"),
    "utf8",
  );
  const direct = source.match(/\.focus\([^)]*\)/g) ?? [];
  const guarded = source.match(/focusUnlessTypingElsewhere\([^)]*\)/g) ?? [];
  expect(direct.length + guarded.length).toBeGreaterThan(0);
  for (const call of direct) expect(call).toContain("preventScroll: true");
  // One argument: the helper's own options, never a scrolling override.
  for (const call of guarded) expect(call).not.toContain(",");

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { focusUnlessTypingElsewhere } = require("@/lib/dom/focus-guard") as typeof import("@/lib/dom/focus-guard");
  const field = document.createElement("textarea");
  document.body.appendChild(field);
  const spy = jest.spyOn(field, "focus");
  focusUnlessTypingElsewhere(field);
  expect(spy).toHaveBeenCalledWith({ preventScroll: true });
  field.remove();
});
