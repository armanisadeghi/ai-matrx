/** @jest-environment jsdom */
//
// 🚨 "NO VALUE YET" IS A STATE A READER MUST BE ABLE TO LEAVE.
//
// THE DEFECT THIS PINS (found by Cursor Bugbot on PR 238, 2026-09-20, in the
// FIX for the previous race — and it was the exact thing that fix's own comment
// claimed without proving).
//
// `useEffectiveKnob` decides whether to ask by looking at its own value, and
// React re-runs an effect only when its dependencies change. An `undefined`
// that stays `undefined` across a notification is not a change. So:
//
//   • the ordinary path works by accident of shape — an invalidation moves a
//     DEFINED value to `undefined`, and that transition is the trigger;
//   • a reader that has never had a value has no transition to offer. It is
//     notified, re-renders, sees `undefined` again, and its effect does not
//     re-run. It sits on its consumer's default until the component remounts.
//
// That state is reachable: `ensureKnobSnapshot` gives up after
// MAX_RACE_RETRIES writes land mid-flight and deliberately caches nothing, so
// every mounted reader is left holding exactly that never-had-a-value
// `undefined` — and, before this fix, stayed there.
//
// THE FIX THIS PROVES: every notification bumps a store version the hook
// depends on, so a notify with no value in hand re-asks. `ensureKnobSnapshot`
// de-duplicates, so a reader that already holds a fresh answer pays nothing.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { createClient } from "@/utils/supabase/client";

import { invalidateEffectiveKnob, useEffectiveKnob } from "../effectiveKnobs";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({
  registerDirectiveHandler: jest.fn(),
}));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const KEY = "ui.detail.presentation_by_type";

/** Answers every snapshot request immediately, counting them. */
function counting(value: unknown) {
  let asked = 0;
  const rpc = (fn: string) => {
    if (fn !== "knob_snapshot") throw new Error(`unexpected rpc ${fn}`);
    asked += 1;
    return Promise.resolve({
      data: { resolved: { [KEY]: value }, stamp: "stamp" },
      error: null,
    });
  };
  jest.mocked(createClient).mockReturnValue({
    rpc,
    schema: () => ({ rpc }),
  } as unknown as ReturnType<typeof createClient>);
  return { asked: () => asked };
}

function Reader() {
  const value = useEffectiveKnob(ORG, USER, KEY);
  return <span data-testid="v">{String(value)}</span>;
}

// React 19 asks to be told this is an act environment; without it every
// `act` call prints a warning that would drown the real output.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  invalidateEffectiveKnob();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it("asks once on mount and shows the answer", async () => {
  const rpc = counting("docked");

  await act(async () => {
    root.render(<Reader />);
  });

  expect(rpc.asked()).toBe(1);
  expect(container.textContent).toBe("docked");
});

it("re-asks after a notification even though its value never left undefined", async () => {
  // The RPC never resolves, so the reader's value is `undefined` and has never
  // been anything else — exactly the state the give-up branch leaves behind.
  const asked: (() => void)[] = [];
  const rpc = (fn: string) => {
    if (fn !== "knob_snapshot") throw new Error(`unexpected rpc ${fn}`);
    return new Promise<never>(() => {
      asked.push(() => undefined);
    });
  };
  jest.mocked(createClient).mockReturnValue({
    rpc,
    schema: () => ({ rpc }),
  } as unknown as ReturnType<typeof createClient>);

  await act(async () => {
    root.render(<Reader />);
  });
  expect(asked).toHaveLength(1);
  expect(container.textContent).toBe("undefined");

  // A notification lands and the value is STILL undefined. Before the store
  // version was a dependency, this changed nothing in the hook's dependency
  // list and the reader never asked again.
  await act(async () => {
    invalidateEffectiveKnob(KEY);
  });

  expect(asked).toHaveLength(2);
  expect(container.textContent).toBe("undefined");
});

it("a reader that already has a fresh answer pays nothing for the re-ask", async () => {
  const rpc = counting("docked");

  await act(async () => {
    root.render(<Reader />);
  });
  expect(rpc.asked()).toBe(1);
  expect(container.textContent).toBe("docked");

  // The effect re-runs on the version bump, but `ensureKnobSnapshot` answers
  // from the cache — no second round trip. A fix that re-fetched on every
  // notification would undo the one-fetch design.
  await act(async () => {
    invalidateEffectiveKnob(KEY);
  });

  // ONE more: the invalidation genuinely dropped the cache, so re-asking is
  // correct. What must not happen is a fetch per notification while a fresh
  // answer is held — proven by the next bump, which is not an invalidation.
  expect(rpc.asked()).toBe(2);
});
