/**
 * GUARD — an opening window never takes focus out of a field she is typing in
 * (Masterwork cold walk 23, 2026-09-30).
 *
 * `/masterwork/<id>?interview=1&rename=1` opened the title's inline rename
 * and the interview's docked panel on one load. The panel's focus-on-open
 * moved focus into itself ~60ms after the rename field took it; the field
 * blurred and EditableLabel commits-and-closes on blur, so the rename was
 * gone before she could type (measured headless on localhost).
 *
 * SUT: the real MatrxDynamicPanelHost focus effect and the shared rule in
 * focusOnOpen.ts. Doubles: next/dynamic (the docked panel shell renders its
 * children directly — its resize chrome is not under test).
 *
 * RED before the fix: "a field outside keeps focus" failed — focus moved to
 * the panel's own input.
 *
 * Review follow-up (2026-09-30): the rule holds only for a field inside a
 * KEEP_FOCUS_ATTRIBUTE container (the inline rename the page opened). A panel
 * she opens with Enter or a hotkey from any other field still takes focus; a
 * declined first attempt still retries, so a field that goes away a frame
 * later leaves focus in the panel, not on <body>; a <select> never holds
 * focus back. RED before the follow-up: the unmarked-field, retry and select
 * cases.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("next/dynamic", () => () =>
  function DynamicStub({ children }: { children?: React.ReactNode }) {
    return <div>{children}</div>;
  },
);

import { MatrxDynamicPanelHost } from "../MatrxDynamicPanelHost";
import {
  KEEP_FOCUS_ATTRIBUTE,
  isEditableField,
  mayTakeFocusOnOpen,
} from "../focusOnOpen";

let host: HTMLDivElement;
let root: Root;
let rects: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  // jsdom lays nothing out; the host only focuses elements with client rects.
  rects = jest
    .spyOn(HTMLElement.prototype, "getClientRects")
    .mockReturnValue([{}] as unknown as DOMRectList);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  rects.mockRestore();
  jest.useRealTimers();
});

function Page({ open, field = true }: { open: boolean; field?: boolean }) {
  return (
    <>
      {field ? (
        <h2 {...{ [KEEP_FOCUS_ATTRIBUTE]: "" }}>
          <input aria-label="Rulebook name" defaultValue="walk23-Recoat Verdict" />
        </h2>
      ) : null}
      <input aria-label="Search" />
      <select aria-label="Sort" defaultValue="a">
        <option value="a">A</option>
      </select>
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={() => {}}
        title="Your interviewer"
        initialFocus
      >
        <textarea aria-label="Message" />
      </MatrxDynamicPanelHost>
    </>
  );
}

function flushFrames() {
  // Portal target (rAF) → focus effect (rAF, rAF, 120ms timer).
  for (let i = 0; i < 6; i += 1) {
    act(() => {
      jest.advanceTimersByTime(130);
    });
  }
}

const rename = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Rulebook name"]')!;
const composer = () =>
  document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');

it("a marked inline edit outside the opening panel keeps focus", () => {
  act(() => root.render(<Page open={false} />));
  rename().focus();
  expect(document.activeElement).toBe(rename());

  act(() => root.render(<Page open />));
  flushFrames();

  expect(composer()).not.toBeNull();
  expect(document.activeElement).toBe(rename());
});

it("a panel opened from an ordinary field (Enter, a hotkey) takes focus", () => {
  act(() => root.render(<Page open={false} />));
  document.querySelector<HTMLInputElement>('input[aria-label="Search"]')!.focus();

  act(() => root.render(<Page open />));
  flushFrames();

  expect(document.activeElement).toBe(composer());
});

it("a declined first attempt still retries, so a field gone a frame later leaves focus in the panel", () => {
  act(() => root.render(<Page open={false} />));
  rename().focus();

  act(() => root.render(<Page open />));
  // Portal rAF, then the first focus attempt (declined: she is in the field).
  act(() => {
    jest.advanceTimersByTime(40);
  });
  expect(document.activeElement).toBe(rename());
  // The field commits and unmounts before the 120ms retry.
  act(() => root.render(<Page open field={false} />));
  flushFrames();

  expect(document.activeElement).toBe(composer());
});

it("a <select> never holds focus back", () => {
  act(() => root.render(<Page open={false} />));
  document.querySelector<HTMLSelectElement>('select[aria-label="Sort"]')!.focus();

  act(() => root.render(<Page open />));
  flushFrames();

  expect(document.activeElement).toBe(composer());
});

it("with nothing being typed in, the panel still takes focus on open", () => {
  act(() => root.render(<Page open={false} />));
  (document.activeElement as HTMLElement | null)?.blur();

  act(() => root.render(<Page open />));
  flushFrames();

  expect(document.activeElement).toBe(composer());
});

describe("focusOnOpen rule", () => {
  it("treats text fields as editable and buttons and selects as not", () => {
    expect(isEditableField(document.createElement("select"))).toBe(false);
    const button = document.createElement("button");
    const text = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    const readOnly = document.createElement("textarea");
    readOnly.readOnly = true;
    expect(isEditableField(text)).toBe(true);
    expect(isEditableField(button)).toBe(false);
    expect(isEditableField(checkbox)).toBe(false);
    expect(isEditableField(readOnly)).toBe(false);
  });

  it("holds focus back only for a marked field outside the window", () => {
    const win = document.createElement("div");
    const inside = document.createElement("input");
    win.appendChild(inside);
    document.body.appendChild(win);
    inside.focus();
    expect(mayTakeFocusOnOpen(win)).toBe(true);
    const plain = document.createElement("input");
    document.body.appendChild(plain);
    plain.focus();
    expect(mayTakeFocusOnOpen(win)).toBe(true);
    const mark = document.createElement("div");
    mark.setAttribute(KEEP_FOCUS_ATTRIBUTE, "");
    const marked = document.createElement("input");
    mark.appendChild(marked);
    document.body.appendChild(mark);
    marked.focus();
    expect(mayTakeFocusOnOpen(win)).toBe(false);
    win.remove();
    plain.remove();
    mark.remove();
  });
});
