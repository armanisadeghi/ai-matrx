/**
 * FIX-Q9 (ONE-RESOLUTION register, 2026-09-11) — ONE GOAL READER, ONE
 * PRECEDENCE, AND A GOAL WRITE THAT STALES NOTHING.
 *
 * What was live: the goal had TWO readers that disagreed. The workspace read
 * the STORED row (`agent.mandate.goal`); the admin goal pane read the CODE
 * CATALOGUE (`GET /mandates`) and nothing else. Two live paths ended in the
 * false sentence *"No goal declared for <key>."*:
 *
 *   1. A Mandate created in the UI — stored goal present, no code declaration
 *      — printed its goal in its workspace and "No goal declared" in the admin
 *      pane and the MandateWindow host, about the same Mandate.
 *   2. A goal edited in-session: `patchMandateGoal` called
 *      `invalidateMandateCache`, which cleared the resolution and pin caches
 *      and never touched `catalogue.ts`'s PAGE-LIFETIME cache — so the pane
 *      kept printing the pre-edit text (or the false sentence) until a reload.
 *
 * The fix is at the class: `features/mandates/goal.ts` holds the ONE
 * precedence (stored first, catalogue as fallback), `MandateGoalBlock` is the
 * ONE block that prints a goal or its absence, and `invalidateMandateCache`
 * clears every cache a goal write can stale — the catalogue included.
 *
 * RED/GREEN, run against the SHIPPED files on 2026-09-11:
 *
 *   · Revert `useMandateGoal` to its catalogue-only read (`stored: undefined`)
 *     → test 1 fails with exactly the live lie:
 *       Received string: "GoalNo goal declared for zzz.fixq9.scratch."
 *   · Remove `invalidateMandateCatalogueCache()` from `invalidateMandateCache`
 *     → tests 4 and 5 fail (the second fetch never happens: Expected 1,
 *       Received 0; the mounted block keeps the pre-edit text), and test 2
 *       fails with it because the suite's own `beforeEach` reset goes through
 *       the same door.
 *   · Both files restored → 6 passed.
 *
 * Nothing here is stubbed but the network and the redux dispatch — the
 * resolver, the hook, the block and the invalidation are all shipped code.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "zzz.fixq9.scratch";

/** What the next `GET /mandates` answers with, and how many times it was asked. */
let mockCatalogueEntries: Array<{ mandate_key: string; goal: string | null }> =
  [];
let mockCatalogueCalls = 0;

jest.mock("@/lib/api/call-api", () => ({
  callApi: (args: unknown) => ({ __callApi: args }),
}));

/** The catalogue takes its dispatch as an argument; the hook takes redux's. */
const mockDispatch = ((): unknown => {
  mockCatalogueCalls += 1;
  return { data: { mandates: mockCatalogueEntries }, error: null };
}) as unknown as never;

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: () => undefined,
}));

jest.mock("@/components/official/entity-ref/TextWithDoors", () => ({
  TextWithDoors: ({ text }: { text: string }) => <span>{text}</span>,
}));

// ── `../service` is the real module; only its edges are stubbed. ─────────────
jest.mock("@/lib/api/errors", () => ({
  BackendApiError: class extends Error {
    status: number;
    constructor(init: { status: number }) {
      super("backend");
      this.status = init.status;
    }
  },
}));
jest.mock("@/lib/python-client", () => ({
  getJson: async () => {
    throw new Error("no resolution is asked for in this suite");
  },
}));
jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: async () => "ready",
  peekSelectedOrganizationId: () => "org-1",
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          order: () => chain,
          limit: async () => ({ data: [], error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      },
    }),
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
  }),
}));

import { MandateGoalBlock } from "../MandateGoalBlock";
import { fetchMandateCatalogue } from "../catalogue";
import { resolveMandateGoal } from "../goal";
import { invalidateMandateCache } from "../service";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockCatalogueEntries = [];
  mockCatalogueCalls = 0;
  // Drops every cache, the catalogue's included — which is itself the fix.
  invalidateMandateCache();
  mockCatalogueCalls = 0;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(node);
  });
  await settle();
}

// ───────────────────────────────────────────────────────────────────────────
// 1. THE FALSE SENTENCE. A stored goal with no code declaration.
// ───────────────────────────────────────────────────────────────────────────

it("never says 'No goal declared' about a Mandate whose goal is stored", async () => {
  mockCatalogueEntries = []; // A UI-created Mandate: nothing in code declares it.

  await render(
    <MandateGoalBlock
      mandateKey={KEY}
      storedGoal="Draft the weekly parent update from the class log."
      description={null}
    />,
  );

  expect(container.textContent).toContain("Draft the weekly parent update");
  expect(container.textContent).not.toContain("No goal declared");
  // And it does not blame the catalogue for an absence that isn't one.
  expect(container.textContent).not.toContain("Declared in code");
});

// ───────────────────────────────────────────────────────────────────────────
// 2 & 3. The fallback still works, and absence is still sayable.
// ───────────────────────────────────────────────────────────────────────────

it("falls back to the code declaration when the row stores no goal", async () => {
  mockCatalogueEntries = [{ mandate_key: KEY, goal: "The declared goal." }];

  await render(
    <MandateGoalBlock mandateKey={KEY} storedGoal={null} description={null} />,
  );

  expect(container.textContent).toContain("The declared goal.");
  expect(container.textContent).toContain("Declared in code");
  expect(container.textContent).not.toContain("No goal declared");
});

it("says 'No goal declared' only when BOTH readers came back empty", async () => {
  mockCatalogueEntries = [{ mandate_key: KEY, goal: "   " }];

  await render(
    <MandateGoalBlock mandateKey={KEY} storedGoal="  " description={null} />,
  );

  expect(container.textContent).toContain(`No goal declared for ${KEY}.`);
});

it("resolves the precedence in one place: stored beats the catalogue", () => {
  expect(
    resolveMandateGoal({ stored: "stored", catalogue: "declared" }),
  ).toEqual({ goal: "stored", source: "stored" });
  expect(resolveMandateGoal({ stored: "   ", catalogue: "declared" })).toEqual({
    goal: "declared",
    source: "catalogue",
  });
  expect(resolveMandateGoal({ stored: null, catalogue: null })).toEqual({
    goal: null,
    source: null,
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. THE CACHE A GOAL WRITE USED TO LEAVE STANDING.
// ───────────────────────────────────────────────────────────────────────────

it("drops the page-lifetime catalogue when a mandate write invalidates", async () => {
  mockCatalogueEntries = [{ mandate_key: KEY, goal: "v1" }];

  await fetchMandateCatalogue(mockDispatch);
  await fetchMandateCatalogue(mockDispatch);
  expect(mockCatalogueCalls).toBe(1); // Cached for the page's life, as designed.

  // This is what `patchMandateGoal` calls after `PATCH /mandates/{key}/goal`.
  invalidateMandateCache(KEY);

  mockCatalogueEntries = [{ mandate_key: KEY, goal: "v2" }];
  const after = await fetchMandateCatalogue(mockDispatch);
  expect(mockCatalogueCalls).toBe(2);
  expect(after[KEY]?.goal).toBe("v2");
});

// ───────────────────────────────────────────────────────────────────────────
// 5. THE WHOLE POINT: the edited goal appears with NO reload.
// ───────────────────────────────────────────────────────────────────────────

it("re-reads a mounted goal block after a goal write, without a reload", async () => {
  mockCatalogueEntries = [{ mandate_key: KEY, goal: "The goal before the edit." }];

  await render(
    <MandateGoalBlock mandateKey={KEY} storedGoal={null} description={null} />,
  );
  expect(container.textContent).toContain("The goal before the edit.");

  mockCatalogueEntries = [{ mandate_key: KEY, goal: "The goal after the edit." }];
  await act(async () => {
    invalidateMandateCache(KEY);
  });
  await settle();

  expect(container.textContent).toContain("The goal after the edit.");
  expect(container.textContent).not.toContain("before the edit");
});
