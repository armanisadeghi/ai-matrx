/**
 * THE RED TWIN of `recordChangeApproval.live.test.tsx`. It asserts the world as
 * it stood before this lane and it MUST FAIL.
 *
 * Before: a `records` tool result carrying `awaiting_approval` reached the chat
 * and nothing drew a decision; approving was not a thing a person could do, so
 * the change could never land from the conversation; and the only sentence
 * anybody got about a refusal stopped at "not done" without naming the one
 * setting that governs it.
 *
 * Each clause below states one of those three as if it were still true. A green
 * run of this file would mean the card had stopped working; three failures are
 * what makes the green twin mean something. Excluded from `pnpm test` by
 * jest.config.ts (`\\.red\\.test\\.tsx?$`) and run BY NAME.
 */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import type { RecordsClient } from "@ai-matrx/records/core";
import type { SupabaseClient } from "@supabase/supabase-js";

import { declinedSentence } from "../recordChangeApproval";
import {
  canRun,
  fieldExists,
  onAFreshTable,
  ORGANIZATION,
  signInAsAdmin,
  waitFor as capturedWait,
} from "./harness";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const describeLive = canRun ? describe : describe.skip;

describeLive("the world before the approval card (RED — these must fail)", () => {
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

  async function render(which: "redTwin"): Promise<{ tableId: string; key: string }> {
    const { wait, tableId } = await onAFreshTable(store, capturedWait(which));
    const key = wait.change.change === "field" ? wait.change.key : "";
    await act(async () => {
      root.render(
        <Provider store={reduxStore}>
          <Card wait={wait} callId={`red-${which}`} conversationId="red-suite" />
        </Provider>,
      );
    });
    await settle();
    return { tableId, key };
  }

  function buttons(): string[] {
    return Array.from(container.querySelectorAll("button")).map((b) =>
      (b.textContent ?? "").trim().toLowerCase(),
    );
  }

  it("RED: a wait renders nothing a person can act on", async () => {
    await render("redTwin");
    expect(buttons()).not.toContain("apply");
  }, 180_000);

  it("RED: approving cannot make the change land", async () => {
    const { tableId, key } = await render("redTwin");
    const apply = Array.from(container.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim().toLowerCase() === "apply",
    );
    if (apply) {
      await act(async () => {
        (apply as HTMLButtonElement).click();
      });
      await settle(10);
    }
    expect(await fieldExists(store, tableId, key)).toBe(false);
  }, 180_000);

  it("RED: a decline says only that nothing was done", () => {
    const wait = capturedWait("redTwin");
    expect(declinedSentence(wait)).not.toContain("custom/agent_schema_changes");
  });
});
