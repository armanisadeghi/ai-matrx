/**
 * Round 38 (D5): "+ New" opened the row's side peek but left focus on the New button, so typing a title
 * pressed New once per space and once on Enter — one row became five. The peek takes focus when it opens,
 * and a fresh row's peek puts the cursor in its first field.
 */
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

import { SidePeek } from "../menu-parts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setup(focusFirstField: boolean, body: ReactNode) {
  const trigger = document.createElement("button");
  trigger.textContent = "New";
  document.body.appendChild(trigger);
  trigger.focus();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return {
    trigger,
    root,
    render: () =>
      root.render(
        <SidePeek onClose={() => undefined} focusFirstField={focusFirstField}>
          {body}
        </SidePeek>,
      ),
  };
}

it("an opened peek holds the keys, never the button that opened it", async () => {
  const { trigger, root, render } = setup(false, <p>Quarterly patient recall mailing</p>);
  expect(document.activeElement).toBe(trigger);
  await act(async () => render());
  expect(document.activeElement).not.toBe(trigger);
  expect((document.activeElement as HTMLElement).closest(".spaces-peek-side")).not.toBeNull();
  await act(async () => root.unmount());
});

it("a fresh row's peek puts the cursor in its first field", async () => {
  const { root, render } = setup(true, <input aria-label="Name" />);
  await act(async () => render());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Name");
  await act(async () => root.unmount());
});

it("a fresh row's peek that draws its title as text presses Edit, and the field it opens takes the cursor", async () => {
  function Body() {
    const [editing, setEditing] = useState(false);
    return (
      <dl>
        <dt>Name</dt>
        <dd>{editing ? <input aria-label="Name input" /> : <span role="button" tabIndex={0} aria-label="Edit Name" onClick={() => setEditing(true)} />}</dd>
      </dl>
    );
  }
  const { root, render } = setup(true, <Body />);
  await act(async () => render());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
  expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("Name input");
  await act(async () => root.unmount());
});
