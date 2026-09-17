/**
 * A CHIP THAT FILLS THE BOX LEAVES YOU ABLE TO SEND.
 *
 * 🚨 THE DEFECT (Masterwork cold walk 5, finding 6b, 2026-09-16). In the
 * Conductor, clicking the `Build it` quick-reply chip filled the composer with
 * the real message and then left it unsendable: Enter did nothing, clicking the
 * chip again did nothing, and only hunting down the round send-arrow with the
 * mouse actually sent it.
 *
 * THE ROOT CAUSE was never the state — the text really was in the composer. A
 * native `<button>` takes focus on mousedown, so after the click the focused
 * element was the CHIP; Enter went there, fired a synthetic click, re-staged the
 * same text (a no-op) and never reached the composer's key handler.
 *
 * THE FORCING FUNCTION: a real composer input carrying the same
 * `data-agent-main-input` marker `AgentTextarea` stamps, a real chip, real
 * mousedown+click events, and the ONE question that matters afterwards — where
 * is the caret?
 *
 * RED against a plain `<button onClick={stage}>`: `document.activeElement` is
 * the button.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  AGENT_MAIN_INPUT_ATTR,
  ComposerChip,
  focusAgentComposer,
} from "../components/inputs/smart-input/ComposerChip";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const MESSAGE =
  "We've worked through enough. Build it — and leave the unresolved pieces as open steps rather than pretending.";

function Harness({ onStage }: { onStage: () => void }) {
  return (
    <div>
      <textarea {...{ [AGENT_MAIN_INPUT_ATTR]: "" }} defaultValue="" />
      <ComposerChip label="Build it" onStage={onStage} />
    </div>
  );
}

async function mount(node: React.ReactNode): Promise<{
  container: HTMLElement;
  root: Root;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root!: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(node);
  });
  return { container, root };
}

describe("a chip that fills the box leaves you able to send", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("stages the message and leaves the caret in the composer", async () => {
    let staged = "";
    const { container, root } = await mount(
      <Harness
        onStage={() => {
          const box = container.querySelector("textarea")!;
          box.value = MESSAGE;
          staged = MESSAGE;
        }}
      />,
    );
    const box = container.querySelector("textarea")!;
    const chip = container.querySelector("button")!;

    await act(async () => {
      chip.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(staged).toBe(MESSAGE);
    expect(document.activeElement).toBe(box);
    expect(document.activeElement).not.toBe(chip);
    expect(box.selectionStart).toBe(MESSAGE.length);
    await act(async () => root.unmount());
  });

  it("never steals a caret that was already in the composer", async () => {
    const { container, root } = await mount(<Harness onStage={() => undefined} />);
    const box = container.querySelector("textarea")!;
    const chip = container.querySelector("button")!;
    box.focus();

    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    await act(async () => {
      chip.dispatchEvent(down);
    });

    expect(down.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(box);
    await act(async () => root.unmount());
  });

  it("says so honestly when there is no composer to focus", () => {
    expect(focusAgentComposer(document.createElement("div"))).toBe(false);
  });
});
