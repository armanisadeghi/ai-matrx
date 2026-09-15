/**
 * A LIVE PANE IS ALWAYS REACHABLE.
 *
 * The production defect these guards pin (independent review of row
 * 1a4fbff1-b6ed-451e-b90d-d755c17624c1, commit `528560bbc8`, 2026-09-15):
 *
 *   A chat bound to a running sandbox box, with a document the agent had
 *   created. Reload. Wait until the composer chip reads "Connected". Click
 *   Canvas — and the canvas shows ONLY the document. `[data-canvas-switcher]`
 *   is ABSENT, because the switcher needs two items and there is one. There is
 *   no control anywhere that reaches the Sandbox again; the sandbox chip popup
 *   offers only Disconnect and switch-box. The box is running and the chat is
 *   bound to it, and the only way back is to wait for the agent to run another
 *   shell command. Reproduced twice, cleanly.
 *
 * ROOT CAUSE: the canvas slice is deliberately NOT persisted while the reveal
 * memory IS, so after a reload `alreadyAutoOpened` is true against an empty
 * canvas — and `decideSandboxCanvasAction` answered `"none"` to that, meaning
 * the item was not even OFFERED. The document took the single restored slot
 * and the live pane had no door.
 *
 * THE CLASS: every canvas content type that is NON_PERSISTABLE and backed by
 * something still running. `features/canvas/liveSourceReachability.ts` is the
 * one rule — offered for as long as the source exists, never a switcher entry
 * when it does not.
 *
 * Everything under test runs for real: the real reducer, the real decision
 * functions, the real switcher rule, the real history component.
 *
 * Proven failing before passing (re-run each mutation to re-prove):
 *   m1. `keepLiveSourceReachable` returns `action` unchanged (the shipped
 *       behaviour) → the reload test finds ONE canvas item and no switcher.
 *   m2. `keepLiveSourceReachable` returns "offer" even when `sourceExists` is
 *       false → an unbound conversation grows a Sandbox entry with nothing
 *       behind it.
 *   m3. `isLiveSourcePaneType` returns false for everything → the canvas
 *       history offers Remove on a live pane the surface will re-offer.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import {
  canvasSlice,
  offerCanvasItem,
  selectCanvasItems,
  selectCanvasIsOpen,
  isPersistableCanvasType,
  type CanvasContent,
} from "@/features/canvas/redux/canvasSlice";
import { shouldShowCanvasSwitcher } from "@/features/canvas/core/canvasSwitcher";
import {
  keepLiveSourceReachable,
  isLiveSourcePaneType,
} from "@/features/canvas/liveSourceReachability";
import {
  buildSandboxCanvasContent,
  decideSandboxCanvasAction,
  sandboxCanvasSourceId,
} from "@/features/agents/components/chat/sandbox-insight/useOpenSandboxCanvas";
import { buildDocumentCanvasContent } from "@/features/data-tables/hooks/useOpenDocumentCanvas";
import { CanvasNavigation } from "@/features/canvas/core/CanvasNavigation";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION_ID = "881cf190-4f51-4ebe-a9c9-ecd3a4b9ce6b";
const SANDBOX_ROW_ID = "9aa2f6a6-1f7c-4a0a-9c1f-2f1d2b6c1f3d";
const DOC_ID = "9be6ac95-b1d8-4876-b96a-a0d6ede90729";

const makeStore = () =>
  configureStore({ reducer: { canvas: canvasSlice.reducer } });

/** The reveal decision a BOUND conversation reaches after a reload: the box is
 *  live, a tool has run in it, and the reveal already happened last session. */
const afterReload = {
  bound: true,
  toolRan: true,
  autoOpen: true,
  alreadyAutoOpened: true,
  userClosed: false,
  canvasHasOtherContent: true,
};

describe("the rule itself", () => {
  it("never leaves a live source with nothing to click", () => {
    expect(keepLiveSourceReachable("none", true)).toBe("offer");
  });

  it("never invents a pane for a source that does not exist", () => {
    for (const action of ["open", "offer", "none"] as const) {
      expect(keepLiveSourceReachable(action, false)).toBe("none");
    }
  });

  it("changes nothing about opening or offering when the source is live", () => {
    expect(keepLiveSourceReachable("open", true)).toBe("open");
    expect(keepLiveSourceReachable("offer", true)).toBe("offer");
  });

  it("names exactly the non-persistable live types", () => {
    expect(isLiveSourcePaneType("sandbox")).toBe(true);
    expect(isLiveSourcePaneType("cloud_browser")).toBe(true);
    expect(isLiveSourcePaneType("udt_document")).toBe(false);
    expect(isLiveSourcePaneType("code")).toBe(false);
    expect(isLiveSourcePaneType(undefined)).toBe(false);
    // Both live types really are the unsaveable kind — that is WHY nothing
    // restores them and why their surface must keep offering them.
    expect(isPersistableCanvasType("sandbox")).toBe(false);
    expect(isPersistableCanvasType("cloud_browser")).toBe(false);
  });
});

describe("GUARD 1 — a bound chat with a persisted document, after a reload", () => {
  it("offers the Sandbox beside the document, so the switcher has two items", () => {
    // Exactly the reviewer's state: the canvas is empty (the slice is not
    // persisted), the document comes back from its own pointer, and the
    // sandbox surface decides what to do about a box that is still bound.
    const store = makeStore();

    store.dispatch(
      offerCanvasItem(
        buildDocumentCanvasContent({
          documentId: DOC_ID,
          title: "Reviewer Probe",
          conversationId: CONVERSATION_ID,
        }),
      ),
    );

    const action = decideSandboxCanvasAction(afterReload);
    expect(action).toBe("offer");

    if (action === "offer") {
      store.dispatch(
        offerCanvasItem(
          buildSandboxCanvasContent({
            sandboxRowId: SANDBOX_ROW_ID,
            conversationId: CONVERSATION_ID,
            fallbackName: "bare · ec2 · 9aa2f6",
          }),
        ),
      );
    }

    const items = selectCanvasItems(store.getState());
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.content.type).sort()).toEqual([
      "sandbox",
      "udt_document",
    ]);

    // …and the switcher is therefore on screen, which is the whole point:
    // with one item it is absent by design.
    expect(
      shouldShowCanvasSwitcher({
        paneRole: "single",
        itemCount: items.length,
        isSplit: false,
      }),
    ).toBe(true);
  });

  it("offers and never OPENS — nothing is yanked onto the screen", () => {
    const store = makeStore();
    store.dispatch(
      offerCanvasItem(
        buildSandboxCanvasContent({
          sandboxRowId: SANDBOX_ROW_ID,
          conversationId: CONVERSATION_ID,
        }),
      ),
    );
    expect(selectCanvasIsOpen(store.getState())).toBe(false);
  });

  it("respects the put-away memory: still offered, still not opened", () => {
    expect(
      decideSandboxCanvasAction({ ...afterReload, userClosed: true }),
    ).toBe("offer");
  });

  it("offering the same box twice keeps ONE pane", () => {
    const store = makeStore();
    const content = buildSandboxCanvasContent({
      sandboxRowId: SANDBOX_ROW_ID,
      conversationId: CONVERSATION_ID,
    });
    store.dispatch(offerCanvasItem(content));
    store.dispatch(offerCanvasItem(content));
    expect(selectCanvasItems(store.getState())).toHaveLength(1);
    expect(
      selectCanvasItems(store.getState())[0].sourceMessageId,
    ).toBe(sandboxCanvasSourceId(CONVERSATION_ID, SANDBOX_ROW_ID));
  });
});

describe("GUARD 2 — an UNBOUND conversation has no Sandbox at all", () => {
  it("decides nothing, so nothing is offered", () => {
    for (const toolRan of [false, true]) {
      for (const alreadyAutoOpened of [false, true]) {
        for (const userClosed of [false, true]) {
          expect(
            decideSandboxCanvasAction({
              ...afterReload,
              bound: false,
              toolRan,
              alreadyAutoOpened,
              userClosed,
            }),
          ).toBe("none");
        }
      }
    }
  });

  it("leaves a document-only canvas with one item and no switcher", () => {
    const store = makeStore();
    store.dispatch(
      offerCanvasItem(
        buildDocumentCanvasContent({
          documentId: DOC_ID,
          title: "Reviewer Probe",
          conversationId: CONVERSATION_ID,
        }),
      ),
    );
    if (decideSandboxCanvasAction({ ...afterReload, bound: false }) !== "none") {
      throw new Error("an unbound conversation must not reach the canvas");
    }
    expect(selectCanvasItems(store.getState())).toHaveLength(1);
    expect(
      shouldShowCanvasSwitcher({
        paneRole: "single",
        itemCount: 1,
        isSplit: false,
      }),
    ).toBe(false);
  });
});

describe("the canvas history never offers to remove a live pane", () => {
  it("shows a Remove control for a document and none for the Sandbox", () => {
    const store = makeStore();
    store.dispatch(
      offerCanvasItem(
        buildDocumentCanvasContent({
          documentId: DOC_ID,
          title: "Reviewer Probe",
          conversationId: CONVERSATION_ID,
        }),
      ),
    );
    store.dispatch(
      offerCanvasItem(
        buildSandboxCanvasContent({
          sandboxRowId: SANDBOX_ROW_ID,
          conversationId: CONVERSATION_ID,
        }),
      ),
    );
    const items = selectCanvasItems(store.getState());

    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        <Provider store={store}>
          <CanvasNavigation
            items={items}
            currentItemId={items[0].id}
            onNavigate={() => {}}
            onRemove={() => {}}
          />
        </Provider>,
      );
    });

    // Open the history dropdown the way a person does.
    const trigger = host.querySelector<HTMLButtonElement>(
      '[data-canvas-switcher] [aria-haspopup="menu"]',
    );
    expect(trigger).not.toBeNull();
    act(() => {
      trigger!.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      trigger!.click();
    });

    const removeLabels = Array.from(
      document.querySelectorAll<HTMLElement>("[aria-label^='Remove ']"),
    ).map((el) => el.getAttribute("aria-label"));

    // The document — a stored record — can be taken out of the canvas.
    expect(removeLabels.some((l) => l?.includes("Reviewer Probe"))).toBe(true);
    // The Sandbox — a door to a RUNNING box its surface re-offers — cannot:
    // that control would visibly lose its own fight. Absent, never dead.
    expect(removeLabels.some((l) => l?.includes("Sandbox"))).toBe(false);

    act(() => root.unmount());
    host.remove();
  });
});
