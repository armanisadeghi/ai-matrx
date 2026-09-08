/**
 * FIX-R14 — THE CREATION PAGE NEVER MOVES THE PERSON, AND NEVER LOSES A WORD.
 *
 * The defect, found by an independent walker on production v0.4.1736:
 * `/administration/mandates/new` changed route under them while they were
 * typing, into the EXISTING mandate `zzz_fixr13.scratch_test` — so the name
 * and the goal they were writing went into that record, and the creation they
 * meant to make never happened. Data loss, on every attempt.
 *
 * Three things are pinned here, and each fails against the code that shipped:
 *
 *   1. Typing a key that ALREADY EXISTS leaves the route untouched and prints
 *      a refusal that NAMES the job holding the key, with a link the person
 *      may choose to follow. (Before: the page learned nothing until Create,
 *      and had no link at all.)
 *   2. NOTHING navigates while the form is dirty — proven by driving the whole
 *      form, including the taken key, with a router whose every method is a
 *      spy. The only navigation this page may ever make is the handoff AFTER a
 *      mandate has been created.
 *   3. What was typed SURVIVES the page going away and coming back, and the
 *      restore is announced rather than silent.
 *
 * The probe is mocked at its own module — it is I/O, and what is under test is
 * that the page turns its answer into a SENTENCE rather than a NAVIGATION.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const push = jest.fn();
const replace = jest.fn();
const routerRefresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: routerRefresh, back: jest.fn() }),
}));

jest.mock("@/lib/toast", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => jest.fn(),
  useAppSelector: () => "viewer-1",
  useAppStore: () => ({
    getState: () => ({}),
    dispatch: jest.fn(),
    subscribe: () => () => undefined,
  }),
}));

jest.mock("../service", () => {
  const actual = jest.requireActual("../service");
  return { ...actual, createMandate: jest.fn() };
});

jest.mock("../key-availability", () => {
  const actual = jest.requireActual("../key-availability");
  return { ...actual, probeMandateKey: jest.fn() };
});

// Heavy authoring children — not what this file is about, and they carry their
// own machinery (refs, sync effects, mic streaming) into jsdom.
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: Record<string, unknown>) => (
    <textarea
      aria-label={props["aria-label"] as string}
      value={props.value as string}
      onChange={props.onChange as React.ChangeEventHandler<HTMLTextAreaElement>}
    />
  ),
}));
jest.mock("../OutputKindPicker", () => ({
  OutputKindPicker: () => <div>output kind</div>,
}));

import { NewMandatePage } from "../NewMandatePage";
import { probeMandateKey } from "../key-availability";

const TAKEN = {
  status: "taken" as const,
  mandateKey: "zzz_fixr13.scratch_test",
  label: "ZZZ FIXR13 scratch",
  href: "/administration/mandates/zzz_fixr13.scratch_test",
};

let container: HTMLDivElement;
let root: Root;

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<NewMandatePage />);
  });
}

function unmount() {
  act(() => root.unmount());
  container.remove();
}

/** Type into a controlled field the way a person does — one whole value. */
function typeInto(ariaLabel: string, value: string) {
  const el = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    `[aria-label="${ariaLabel}"]`,
  );
  if (!el) throw new Error(`no field labelled "${ariaLabel}" on the page`);
  const prototype =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("no native value setter on this element");
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Let the debounced probe fire and its promise settle. */
async function settleProbe() {
  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  push.mockClear();
  replace.mockClear();
  window.localStorage.clear();
  (probeMandateKey as jest.Mock).mockResolvedValue({ status: "free" });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("a key that already exists", () => {
  it("refuses ON THE FIELD, names the job that holds it, and offers a link", async () => {
    (probeMandateKey as jest.Mock).mockResolvedValue(TAKEN);
    mount();
    typeInto("Mandate key", "zzz_fixr13.scratch_test");
    await settleProbe();

    expect(container.textContent).toContain("That key is taken");
    expect(container.textContent).toContain("ZZZ FIXR13 scratch");
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/administration/mandates/zzz_fixr13.scratch_test"]',
    );
    // Following it is the PERSON'S choice, and it must not cost them the form.
    expect(link?.target).toBe("_blank");
    unmount();
  });

  it("does NOT navigate — the route is exactly where the person left it", async () => {
    (probeMandateKey as jest.Mock).mockResolvedValue(TAKEN);
    mount();
    typeInto("Mandate key", "zzz_fixr13.scratch_test");
    await settleProbe();

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    unmount();
  });

  it("refuses Create with that reason, so nothing is written to the wrong record", async () => {
    (probeMandateKey as jest.Mock).mockResolvedValue(TAKEN);
    mount();
    typeInto("Mandate name", "ZZZ FIXR14 Walk");
    typeInto("Mandate key", "zzz_fixr13.scratch_test");
    typeInto("Goal", "Everything this job must do well.");
    await settleProbe();

    const button = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Create mandate"),
    );
    expect(button?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "that key belongs to a live job; change it and this works",
    );
    unmount();
  });
});

describe("nothing navigates while the form is dirty", () => {
  it("no router call is made by filling the whole form in", async () => {
    mount();
    typeInto("Mandate name", "ZZZ FIXR14 Walk");
    typeInto("Mandate key", "zzz_fixr14.walk");
    typeInto("Goal", "Everything this job must do well.");
    typeInto("Output constraints", "markdown, max 200 words");
    await settleProbe();

    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    unmount();
  });

  it("the page's source contains exactly ONE navigation, and it is the post-create handoff", () => {
    const source = require("fs").readFileSync(
      require("path").join(
        process.cwd(),
        "features/mandates/authoring/NewMandatePage.tsx",
      ),
      "utf8",
    );
    const navigations = source.match(/router\.(push|replace)\(/g) ?? [];
    expect(navigations).toHaveLength(1);
    // …and it is inside the branch that runs only after `createMandate`
    // resolved, using the key the SERVER said it created.
    expect(source).toContain("adminMandateHref(created.mandateKey)");
  });
});

describe("what was typed survives the page going away", () => {
  it("comes back on the next mount, and the restore is announced", async () => {
    mount();
    typeInto("Mandate name", "ZZZ FIXR14 Walk");
    typeInto("Goal", "Everything this job must do well.");
    await settleProbe();
    unmount();

    mount();
    await act(async () => {
      await Promise.resolve();
    });
    const name = container.querySelector<HTMLInputElement>(
      '[aria-label="Mandate name"]',
    );
    expect(name?.value).toBe("ZZZ FIXR14 Walk");
    expect(container.textContent).toContain("Put back what you were typing");
    unmount();
  });
});
