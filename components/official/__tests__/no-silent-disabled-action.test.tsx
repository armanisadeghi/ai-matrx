/**
 * 🚨 A REQUIRED FIELD THAT IS EMPTY LOOKS EMPTY, AND A DISABLED ACTION SAYS WHY.
 *
 * THE LIVE SHAPE THIS CLOSES (`teach-recent-practitioner` W2, 2026-09-15): a
 * non-technical Expert finished hours of work, reached "Build the Masterwork",
 * and the button was silently disabled. No red text, no tooltip, no toast, no
 * console error — clicking it by ref and by coordinate did nothing. The cause
 * was one empty required name field whose placeholder was a value-shaped
 * suggestion ("Headless Headhunter Resume Review Masterwork"), so the screen
 * showed a filled field and then refused to move.
 *
 * Two forcing functions on the two primitives that class lives in:
 *
 *   GUARD 1 — `Field` with `required` and a blank `value` RENDERS the emptiness:
 *             the control carries `data-required-empty` and the field says the
 *             grey text is an example, not an answer.
 *   GUARD 2 — `GatedActionButton` with a `reason` is disabled AND renders that
 *             sentence, wired to the button by `aria-describedby`. With no
 *             reason it renders no chrome and stays clickable.
 *
 * How to see them go red:
 *   * `Field` — drop the `data-required-empty` wrapper or the empty notice:
 *     GUARD 1 fails.
 *   * `GatedActionButton` — render a plain `<Button disabled>` instead of the
 *     reason + button pair: GUARD 2 fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Field } from "../Field";
import { firstBlockingReason, GatedActionButton } from "../GatedActionButton";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function mount(node: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(node);
  });
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("GUARD 1 — an empty required field looks empty", () => {
  it("marks the control and says the placeholder is not an answer", () => {
    mount(
      <Field label="Masterwork name" htmlFor="n" required value="">
        <input id="n" placeholder="e.g. Headless Headhunter Resume Review" />
      </Field>,
    );

    const control = host.querySelector('[data-slot="field-control"]');
    expect(control?.getAttribute("data-required-empty")).toBe("true");

    const notice = host.querySelector('[data-slot="field-empty-notice"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent ?? "").toMatch(/example, not your answer/i);

    // The lie the wall was made of: a value-shaped placeholder rendered in the
    // same weight and colour as a typed value. It must now be visibly faded
    // and italic, on whatever input the Field happens to wrap.
    expect(control?.className ?? "").toMatch(/placeholder:italic/);
    expect(control?.className ?? "").toMatch(/border-dashed/);
  });

  it("says nothing once the field actually holds a value", () => {
    mount(
      <Field label="Masterwork name" htmlFor="n" required value="Real name">
        <input id="n" placeholder="e.g. Something" />
      </Field>,
    );
    expect(
      host
        .querySelector('[data-slot="field-control"]')
        ?.getAttribute("data-required-empty"),
    ).toBeNull();
    expect(host.querySelector('[data-slot="field-empty-notice"]')).toBeNull();
  });

  it("stays silent on untracked fields — it cannot know they are empty", () => {
    mount(
      <Field label="Masterwork name" htmlFor="n" required>
        <input id="n" />
      </Field>,
    );
    expect(host.querySelector('[data-slot="field-empty-notice"]')).toBeNull();
  });
});

describe("GUARD 2 — a disabled action says why", () => {
  it("renders the reason and wires it to the disabled button", () => {
    mount(
      <GatedActionButton reason="Name your Masterwork to build it">
        Build the Masterwork
      </GatedActionButton>,
    );

    const button = host.querySelector("button");
    expect(button).not.toBeNull();
    expect(button!.disabled).toBe(true);

    // THE POINT OF THE WHOLE GUARD: a dead control is never wordless.
    expect(host.textContent ?? "").toContain(
      "Name your Masterwork to build it",
    );

    const describedBy = button!.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe(
      "Name your Masterwork to build it",
    );
    expect(button!.getAttribute("title")).toBe(
      "Name your Masterwork to build it",
    );
  });

  it("is a plain enabled button with no chrome when nothing blocks", () => {
    const onClick = jest.fn();
    mount(
      <GatedActionButton reason={null} onClick={onClick}>
        Build the Masterwork
      </GatedActionButton>,
    );
    const button = host.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(host.querySelector('[data-slot="gated-action-reason"]')).toBeNull();
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("firstBlockingReason returns one next step, in the order given", () => {
    expect(
      firstBlockingReason([
        { when: false, reason: "a" },
        { when: true, reason: "b" },
        { when: true, reason: "c" },
      ]),
    ).toBe("b");
    expect(firstBlockingReason([{ when: false, reason: "a" }])).toBeNull();
    expect(firstBlockingReason([null, undefined, false])).toBeNull();
  });
});
