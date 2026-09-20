/**
 * THE WAIT IS A DECISION, AND THE DECISION LANDS — against the live store.
 *
 * The defect: under the organization's `ask` setting an agent's change to a
 * table that already existed does not happen. The server said so in the tool
 * result — the change, why it waited, how to change that — and NOTHING drew it,
 * so a person read "waiting for a person" with no person-facing way to be that
 * person. Left there, it is a screen that names a decision and refuses to offer
 * it.
 *
 * Every clause below runs against the MAIN database as `admin@admin.com`, on
 * waits the store's own server half produced (see `harness.ts`). There is no
 * mock of the store, of the switch or of the policy: the card is rendered, a
 * button is clicked, and the assertion is read back out of the store's own
 * doors — the column is there, or it is not.
 *
 * THE RED TWIN is `recordChangeApproval.red.test.tsx`, which asserts the world
 * as it stood before this lane and MUST fail.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import type { RecordsClient } from "@ai-matrx/records/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  canRun,
  declaredKeys,
  fieldExists,
  onAFreshTable,
  ORGANIZATION,
  signInAsAdmin,
  waitFor as capturedWait,
} from "./harness";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const describeLive = canRun ? describe : describe.skip;
if (!canRun) {
  // eslint-disable-next-line no-console
  console.warn(
    "record-change approval live suite SKIPPED — set AI_ADMIN_USERNAME, AI_ADMIN_PASSWORD, " +
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (this repo's " +
      ".env.local has all four) to run it against the real record store.",
  );
}

describeLive("the approval card, against the live record store", () => {
  let supabase: SupabaseClient;
  let userId: string;
  let store: RecordsClient;
  let Card: typeof import("../RecordChangeApprovalCard").RecordChangeApprovalCard;
  let container: HTMLDivElement;
  let root: Root;

  const reduxStore = {
    getState: () => ({
      appContext: { organization_id: ORGANIZATION },
      userAuth: { id: userId },
    }),
    subscribe: () => () => {},
    dispatch: (action: unknown) => action,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  beforeAll(async () => {
    ({ supabase, userId, store } = await signInAsAdmin());
    // The card and its port build a browser client through this specifier; hand
    // them the one signed-in admin client. The store's real doors are still
    // what gets called — nothing about the decision is stubbed.
    jest.doMock("@/utils/supabase/client", () => ({
      createClient: () => supabase,
      supabase,
    }));
    ({ RecordChangeApprovalCard: Card } = await import("../RecordChangeApprovalCard"));
  }, 60_000);

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function settle(times = 6): Promise<void> {
    for (let i = 0; i < times; i += 1) {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
      });
    }
  }

  function button(label: string): HTMLButtonElement {
    const found = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim().toLowerCase() === label.toLowerCase(),
    );
    if (!found) {
      throw new Error(
        `no "${label}" control on the card — the buttons are: ` +
          Array.from(container.querySelectorAll("button"))
            .map((b) => `"${(b.textContent ?? "").trim()}"`)
            .join(", "),
      );
    }
    return found as HTMLButtonElement;
  }

  async function renderWait(
    which: "approve" | "decline",
  ): Promise<{ tableId: string; key: string }> {
    const captured = capturedWait(which);
    const { wait, tableId } = await onAFreshTable(store, captured);
    const key = wait.change.change === "field" ? wait.change.key : "";
    await act(async () => {
      root.render(
        <Provider store={reduxStore}>
          <Card wait={wait} callId={`live-${which}`} conversationId="live-suite" />
        </Provider>,
      );
    });
    await settle();
    return { tableId, key };
  }

  it("draws the wait as a decision, applies it, and the column is then in the store", async () => {
    const { tableId, key } = await renderWait("approve");
    expect(await fieldExists(store, tableId, key)).toBe(false);

    // The change, the reason and the remedy — all three on screen, in the
    // store's own sentences, before anybody decides anything.
    const shown = container.textContent ?? "";
    expect(shown).toContain("Rate card");
    expect(shown).toContain("That table already existed in this organization");
    expect(shown).toContain("custom/agent_schema_changes");

    await act(async () => {
      button("Apply").click();
    });
    await settle(10);

    // It SAYS what now exists…
    expect(container.textContent ?? "").toContain("is now a column on this table");

    // …and the store agrees: the table declares the key and the Field is there.
    expect(await declaredKeys(store, tableId)).toContain(key);
    expect(await fieldExists(store, tableId, key)).toBe(true);
  }, 180_000);

  it("keeps things as they are, says what was not written, and the store is untouched", async () => {
    const { tableId, key } = await renderWait("decline");

    await act(async () => {
      button("Keep as is").click();
    });
    await settle(2);

    const shown = container.textContent ?? "";
    // A decline that only said "declined" would teach nobody anything: it names
    // the change that did not happen AND the one setting that governs it.
    expect(shown).toContain("was not added");
    expect(shown).toContain("custom/agent_schema_changes");

    expect(await declaredKeys(store, tableId)).not.toContain(key);
    expect(await fieldExists(store, tableId, key)).toBe(false);
  }, 180_000);

  it("reads the wait out of the tool result the server actually produced", () => {
    const wait = capturedWait("approve");
    expect(wait.policy.setting).toBe("ask");
    expect(wait.policy.reason).toBe("existing_table_needs_a_person");
    expect(wait.change.change).toBe("field");
    // An ordinary result is not a wait — a card that could appear over a change
    // that already happened would be worse than no card at all.
    expect(readOrdinary()).toBeNull();
  });
});

/** An applied result, which must never be read as a wait. */
function readOrdinary() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { readRecordChangeWait } = require("../recordChangeApproval");
  return readRecordChangeWait({
    proposal: "field",
    applied: true,
    awaiting_approval: false,
    approval: { setting: "never_ask", why: "x", how_to_change: "y" },
  });
}
