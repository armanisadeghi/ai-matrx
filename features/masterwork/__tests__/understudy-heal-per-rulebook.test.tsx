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
    // The card heals through the TRACKED door (the untracked one is
    // module-internal now, precisely so a successful heal cannot leave an
    // older failure standing in the ledger).
    refreshUnderstudyTracked: (rulebookId: string) => {
      healCalls.push(rulebookId);
      return healRejects
        ? Promise.reject(new Error("refresh refused"))
        : Promise.resolve({});
    },
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
        draftCount={0}
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

/**
 * COLD WALK 23 (friction): after only a rename and "Keep mine" the card said
 * "This stand-in is behind your rules … version 10 (0 approved rules) … now at
 * version 13" AND "There is nothing for your stand-in to perform yet." Lag is
 * judged on the rules, and the two sentences never share the card.
 */
const BUILT_AT_10 = {
  id: "wf-understudy",
  name: "Floor — Understudy",
  understudy: true,
  rulebook_version: 10,
  understudy_rules: { approved: 0, unconfirmed: 6 },
  understudy_refreshed_at: null,
} as never;

async function showStandIn(props: {
  approvedCount: number;
  draftCount: number;
  rulebookVersion: number;
  understudyRow?: unknown;
}): Promise<string> {
  const localRoot = root;
  if (!localRoot) throw new Error("nothing mounted");
  await act(async () => {
    localRoot.render(
      <UnderstudyCard
        rulebookId={RULEBOOK_A}
        understudy={(props.understudyRow ?? BUILT_AT_10) as never}
        approvedCount={props.approvedCount}
        draftCount={props.draftCount}
        rulebookVersion={props.rulebookVersion}
        canEdit
        onCreated={() => {}}
      />,
    );
  });
  return container?.textContent ?? "";
}

it("a rename's version bump is not lag — and the stamp is refreshed quietly", async () => {
  const text = await showStandIn({ approvedCount: 0, draftCount: 6, rulebookVersion: 13 });
  expect(text).not.toMatch(/behind your rules|is missing/);
  expect(text).toContain("There is nothing for your stand-in to perform yet.");
  expect(healCalls).toEqual([RULEBOOK_A]);
});

it("never says 'behind' beside 'nothing to perform', even when rules moved", async () => {
  const text = await showStandIn({ approvedCount: 0, draftCount: 9, rulebookVersion: 13 });
  expect(text).toContain("There is nothing for your stand-in to perform yet.");
  expect(text).not.toMatch(/behind your rules|is missing/);
});

it("still says so when an approved rule is missing from the stand-in", async () => {
  const text = await showStandIn({
    approvedCount: 2,
    draftCount: 4,
    rulebookVersion: 13,
    understudyRow: { ...(BUILT_AT_10 as object), understudy_rules: { approved: 0, unconfirmed: 6 } },
  });
  expect(text).toContain("This stand-in is missing 2 approved rules.");
});
