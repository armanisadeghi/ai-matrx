/**
 * A SELF-HEAL BELONGS TO THE RULEBOOK, NOT TO THE PAGE (Bugbot MEDIUM,
 * 2026-09-13).
 *
 * `UnderstudyCard` mints a missing stand-in once, automatically, when an editor
 * opens a Rulebook that predates the Understudy. It latched that "once" in a
 * plain boolean ref — but `RulebookDetailPage` renders this card at the same
 * position across route changes, so React keeps ONE instance and swaps only the
 * props. The latch therefore survived the move between Rulebooks:
 *
 *   - Rulebook A's heal FAILS → the card shows the failure copy.
 *   - The Expert navigates to Rulebook B, which also has no stand-in.
 *   - B shows A's failure, and B's stand-in is never minted. The one free,
 *     idempotent call that exists precisely so nobody has to know about this
 *     never fires, and the page tells the Expert something untrue about a
 *     Rulebook it never even asked about.
 *
 * This drives the REAL card through a real prop swap on one mounted instance,
 * because a fresh mount per Rulebook is exactly the thing that does not happen.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const healCalls: string[] = [];
let healRejects = false;

jest.mock("@/features/masterwork/understudy/refresh", () => {
  const actual = jest.requireActual(
    "@/features/masterwork/understudy/refresh",
  );
  return {
    ...actual,
    refreshUnderstudy: (rulebookId: string) => {
      healCalls.push(rulebookId);
      return healRejects
        ? Promise.reject(new Error("refresh refused"))
        : Promise.resolve({});
    },
    refreshUnderstudyTracked: () => Promise.resolve({}),
    // `getUnderstudyRefreshState` and `subscribeToUnderstudyRefresh` are the
    // REAL ones: the ledger they read is pure in-memory state, and stubbing it
    // would be stubbing the thing the card renders from.
  };
});

jest.mock("@/features/masterwork/components/masterworks/TryMasterworkBox", () => ({
  TryMasterworkBox: () => <div data-testid="try-box" />,
}));

jest.mock("@/features/masterwork/components/AgentCredit", () => ({
  AgentCredit: () => null,
}));

import { UnderstudyCard } from "../understudy/UnderstudyCard";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const RULEBOOK_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RULEBOOK_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  healCalls.length = 0;
  healRejects = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

/** The SAME mounted instance, given a different Rulebook — the real page's move. */
async function showRulebook(rulebookId: string): Promise<void> {
  const localRoot = root;
  if (!localRoot) throw new Error("nothing mounted");
  await act(async () => {
    localRoot.render(
      <UnderstudyCard
        rulebookId={rulebookId}
        understudy={null}
        approvedCount={12}
        rulebookVersion={3}
        canEdit
        onCreated={() => {}}
      />,
    );
  });
}

it("mints a stand-in for the SECOND Rulebook too, on one mounted card", async () => {
  await showRulebook(RULEBOOK_A);
  expect(healCalls).toEqual([RULEBOOK_A]);

  // Re-rendering the same Rulebook must not fire a second paid-for-free call.
  await showRulebook(RULEBOOK_A);
  expect(healCalls).toEqual([RULEBOOK_A]);

  // 🚨 THE DEFECT: the route changes, the instance does not. Before the fix the
  // boolean latch was still set and B never got a stand-in.
  await showRulebook(RULEBOOK_B);
  expect(healCalls).toEqual([RULEBOOK_A, RULEBOOK_B]);
});

it("does not show one Rulebook's heal failure over the next Rulebook", async () => {
  healRejects = true;
  await showRulebook(RULEBOOK_A);
  await act(async () => {
    await Promise.resolve();
  });
  expect(container?.textContent ?? "").toMatch(/couldn|could not|try again/i);

  // B is a different Rulebook: A's failure says nothing about it, and B must
  // get its own attempt rather than inheriting the copy.
  healRejects = false;
  await showRulebook(RULEBOOK_B);
  await act(async () => {
    await Promise.resolve();
  });
  expect(healCalls).toContain(RULEBOOK_B);
});
