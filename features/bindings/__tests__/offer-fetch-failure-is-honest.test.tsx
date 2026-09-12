/**
 * ── AN OFFER THAT COULD NOT BE READ SAYS SO, ONCE ────────────────────────────
 *
 * 🚨 THE DEFECT (FIX-Q8, 2026-09-11, residual of V-PARITY/UX F4). With
 * `GET /mandates/{key}/input-surface` failing, the one-binding workspace put
 * TWO contradictory answers to one question on one screen:
 *
 *   header → "The job's inputs could not be read: HTTP 400"
 *   body   → "This job offers nothing yet. Describe its inputs in the INPUT
 *             section above and they become the values you map here."
 *
 * Two causes, both closed by this suite:
 *
 *   (a) `useMandateInputSurface` set `message` to `result.error.message` RAW,
 *       so a transport code reached a person with no cause and no remedy;
 *   (b) the workspace derived the column's condition a SECOND time as
 *       `offerPending ? "loading" : "ready"`, so the error state arrived at
 *       `<OfferedInventoryColumn>` labelled "ready" with zero values and the
 *       column printed its empty-state copy over a read that never happened.
 *
 * WHAT THIS DRIVES: the real chain, end to end — the real hook with the
 * endpoint forced to fail, the real `offerColumnState`, the real column — and
 * it reads the words a person would read.
 *
 * RED BEFORE THE FIX (both proven; see the register row):
 *   · with `message: result.error.message` restored, "prints no bare transport
 *     code" fails on the literal string `HTTP 400`;
 *   · with `status={offerPending ? "loading" : "ready"}` restored — modelled
 *     here by the second `describe`, which drives the exact expression — the
 *     column renders "offers nothing yet" and the contradiction assertions
 *     fail.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OfferedInventoryColumn } from "../OfferedInventoryColumn";
import { offerColumnState } from "../offer-column-state";
import {
  useMandateInputSurface,
  type MandateInputSurfaceState,
} from "@/features/mandates/input-surface";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** What the endpoint is made to answer for this run. */
let mockApiAnswer: { error?: unknown; data?: unknown } = {};

jest.mock("@/lib/api/call-api", () => {
  const actual = jest.requireActual("@/lib/api/call-api");
  return {
    ...actual,
    // The thunk is never dispatched for real; the fake dispatch below hands
    // back whatever the endpoint is set to answer.
    callApi: () => ({ __call: true }),
  };
});

/**
 * 🚨 A STABLE DISPATCH, deliberately. The real `useAppDispatch` returns the
 * SAME function every render (the store's `dispatch`), and the hook's effect
 * lists it as a dependency. A double that hands back a fresh closure each
 * render is a shape the real framework cannot hold — it re-runs the effect
 * forever ("Maximum update depth exceeded"), which is a defect in the test,
 * not in the hook.
 */
const mockDispatch = () => Promise.resolve(mockApiAnswer);

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: unknown) => {
    // Both selectors this hook reads are satisfied: an organization IS active
    // and the bootstrap HAS resolved, so nothing here can pass by accident on
    // the no-org branch — the failure under test is the endpoint's.
    const name = String(selector);
    if (name.includes("BootstrapResolved") || name.includes("orgResolved")) {
      return true;
    }
    return "org-1";
  },
}));

const MANDATE_KEY = "zzz_fixq8.scratch";

/** The bare transport code that reached a person's screen. */
const BARE = /HTTP\s*\d{3}/;
/** The empty-state copy that contradicted the header. */
const EMPTY_STATE = "This job offers nothing yet";

let container: HTMLDivElement;
let root: Root;
let seen: MandateInputSurfaceState | null = null;

/**
 * The REAL chain: hook → `offerColumnState` → column. Nothing between the
 * endpoint's refusal and the rendered words is a stand-in.
 */
function Column() {
  const surface = useMandateInputSurface(MANDATE_KEY);
  seen = surface;
  const column = offerColumnState({
    provisionKey: null,
    hasResolvedOffer: false,
    hasOffer: false,
    surface,
  });
  return (
    <OfferedInventoryColumn
      values={[]}
      consumedBy={new Map()}
      pinnedContext={[]}
      sourceLine={column.sourceLine}
      sourceSlug={column.sourceSlug}
      status={column.status}
    />
  );
}

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  seen = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("the offered column, with the input-surface endpoint failing", () => {
  beforeEach(async () => {
    // The exact production shape: a 400 whose body carried nothing readable,
    // so every normalizer upstream had only the status to work with.
    mockApiAnswer = {
      error: { type: "validation_error", status: 400, message: "HTTP 400" },
    };
    await act(async () => {
      root.render(<Column />);
    });
    await settle();
  });

  it("reaches the error state — not 'ready with nothing'", () => {
    expect(seen?.status).toBe("error");
  });

  it("prints no bare transport code at a person", () => {
    const text = container.textContent ?? "";
    expect(text).not.toMatch(BARE);
  });

  it("prints ONE sentence, and it carries a remedy", () => {
    const text = container.textContent ?? "";
    expect(text).toContain("could not be read");
    // A remedy is an action the reader can take, not a diagnosis.
    expect(text).toMatch(/Reload the page|report it/i);
    // ONE statement: the sentence is not also in the header.
    const sentence = seen?.status === "error" ? seen.message : "";
    expect(sentence.length).toBeGreaterThan(40);
    expect(text.split(sentence).length - 1).toBe(1);
  });

  it("never says the job offers nothing — nothing was read", () => {
    const text = container.textContent ?? "";
    expect(text).not.toContain(EMPTY_STATE);
    // A count is a settled fact, and there isn't one.
    expect(text).not.toMatch(/\b0\b/);
  });

  it("shows the unreadable body, not the empty body", () => {
    expect(
      container.querySelector('[data-testid="offered-inventory-unreadable"]'),
    ).not.toBeNull();
  });
});

/**
 * ── THE SHIPPED COLLAPSE, DRIVEN DIRECTLY ────────────────────────────────────
 *
 * `status={offerPending ? "loading" : "ready"}` is the expression that shipped.
 * Driving it here keeps the RED executable forever: if anyone re-introduces a
 * two-valued derivation, this is what the screen does — and it is the exact
 * pair of sentences the walker read.
 */
describe("the two-state collapse, kept executable", () => {
  it("is what produced the contradiction", async () => {
    const offerPending = false; // the error state, under the shipped expression
    await act(async () => {
      root.render(
        <OfferedInventoryColumn
          values={[]}
          consumedBy={new Map()}
          pinnedContext={[]}
          sourceLine="The job's inputs could not be read: HTTP 400"
          sourceSlug={null}
          status={offerPending ? "loading" : "ready"}
        />,
      );
    });
    const text = container.textContent ?? "";
    // Both halves of the lie, on one screen.
    expect(text).toMatch(BARE);
    expect(text).toContain(EMPTY_STATE);
  });

  /**
   * THE CENSUS, HELD. `OneBindingWorkspace` collapsed the offer's condition to
   * two values in FOUR places, not one — the offered rail's `status`, the
   * middle column's `offerPending`, and two `offeredCount` claims that reported
   * "0 offered" for a read that never happened. Every one of them now goes
   * through `offerColumn`, and this refuses the shape that shipped.
   */
  it("the workspace derives the offer's condition in exactly one place", () => {
    const source = readFileSync(
      join(__dirname, "..", "OneBindingWorkspace.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    // The shipped collapse, in every spelling it wore.
    expect(source).not.toMatch(/offerPending\s*\?\s*"loading"\s*:\s*"ready"/);
    expect(source).not.toMatch(/offerPending\s*\?\s*null\s*:\s*offeredValues/);
    expect(source).not.toMatch(/offerPending=\{/);

    // And the one door, actually used by all four consumers.
    expect(source).toContain("offerColumnState({");
    expect(
      (source.match(/offerColumn\.status/g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("cannot be reached through offerColumnState — there is only one door", () => {
    const state = offerColumnState({
      provisionKey: null,
      hasResolvedOffer: false,
      hasOffer: false,
      surface: { status: "error", message: "anything at all" },
    });
    expect(state.status).toBe("error");
    expect(state.sourceLine).toBe("anything at all");
  });
});
