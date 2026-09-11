/**
 * components/dialogs/confirm/__tests__/confirm-inside-dialog.test.tsx
 *
 * 🚨 THE DEAD SAVE BUTTON (feedback 11b0a90c, 2026-09-11).
 *
 * `confirm()` raised from inside an OPEN Radix DialogContent never resolved:
 * the handoff waited for `document.body.style.pointerEvents` to clear, and an
 * open Dialog holds that lock for its entire life. The promise never settled,
 * the confirm never rendered, and at least 8 in-dialog Save/Delete handlers
 * silently did nothing — the dead-control class law 4 forbids.
 *
 * These are the three guards. They drive the REAL Radix Dialog, the REAL
 * design-system confirm host and the REAL opener — no stubs on the path under
 * test.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Dialog, DialogContent, DialogTitle } from "@ai-matrx/design-system";
import { ConfirmDialogHost as DesignSystemConfirmHost } from "@ai-matrx/design-system";
import { _resetConfirmOpenerState } from "@ai-matrx/kit/confirm-opener";

import { confirm, CONFIRM_HOST_WAIT_MS } from "../ConfirmDialogHost";
import {
  afterCurrentLayerCloses,
  TRANSIENT_LAYER_WAIT_FRAMES,
} from "../after-current-layer-closes";

let root: Root;
let container: HTMLDivElement;

function Harness({ dialogOpen }: { dialogOpen: boolean }) {
  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>Sync policy</DialogTitle>
          <button type="button">Save policy</button>
        </DialogContent>
      </Dialog>
      <DesignSystemConfirmHost />
    </>
  );
}

/** Let rAF-driven waits, effects and portals settle. */
async function settle(frames = TRANSIENT_LAYER_WAIT_FRAMES + 5) {
  for (let i = 0; i < frames; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function alertDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="alertdialog"]');
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  _resetConfirmOpenerState();
  document.body.style.removeProperty("pointer-events");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.removeProperty("pointer-events");
});

describe("confirm() raised from inside an open dialog", () => {
  it("GUARD 1 — resolves instead of hanging forever", async () => {
    await act(async () => {
      root.render(<Harness dialogOpen />);
    });
    // The dialog really is open and really does own the body lock.
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.style.pointerEvents).toBe("none");

    let settled: boolean | "pending" = "pending";
    const answer = confirm({ title: "Overwrite the sync policy?" }).then(
      (value) => {
        settled = value;
        return value;
      },
    );

    await settle();

    // Before the fix this was null: the confirm never rendered.
    const shown = alertDialog();
    expect(shown).not.toBeNull();
    expect(shown!.textContent).toContain("Overwrite the sync policy?");
    expect(settled).toBe("pending");

    const confirmButton = Array.from(
      shown!.querySelectorAll("button"),
    ).find((b) => (b.textContent ?? "").trim() === "Confirm");
    expect(confirmButton).toBeDefined();
    await act(async () => {
      confirmButton!.click();
    });
    await settle(5);

    await expect(answer).resolves.toBe(true);
  }, 20000);

  it("GUARD 2 — the body pointer lock is restored after the nested confirm closes", async () => {
    await act(async () => {
      root.render(<Harness dialogOpen />);
    });

    const answer = confirm({ title: "Delete the row?", variant: "destructive" });
    await settle();
    const shown = alertDialog();
    expect(shown).not.toBeNull();

    const cancel = Array.from(shown!.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").trim() === "Cancel",
    );
    await act(async () => {
      cancel!.click();
    });
    await settle(5);
    await expect(answer).resolves.toBe(false);

    // The OUTER dialog is still open, so the lock is still legitimately held
    // by it — and the dialog's own controls are inside the lock's exemption.
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    // Close the outer dialog: now nothing owns the lock and the page must be
    // alive again. This is the R2-1 page-killer, re-proven for the nested case.
    await act(async () => {
      root.render(<Harness dialogOpen={false} />);
    });
    await settle(5);
    expect(document.body.style.pointerEvents).not.toBe("none");
  }, 20000);
});

describe("the transient-layer wait", () => {
  it("GUARD 3 — is bounded: a layer that never releases stops the wait instead of hanging", async () => {
    const scheduled: FrameRequestCallback[] = [];
    let outcome: string | null = null;

    void afterCurrentLayerCloses(
      (callback) => {
        scheduled.push(callback);
        return scheduled.length;
      },
      () => false, // never closes — the Dialog case, and any stuck layer
    ).then((result) => {
      outcome = result;
    });

    for (let frame = 0; frame <= TRANSIENT_LAYER_WAIT_FRAMES + 2; frame += 1) {
      const next = scheduled.shift();
      if (!next) break;
      next(frame * 16);
      await Promise.resolve();
    }

    expect(outcome).toBe("timed-out");
    expect(scheduled).toHaveLength(0);
  });
});

describe("a confirm that cannot be shown", () => {
  it("GUARD 4 — throws instead of hanging when no host is mounted", async () => {
    // No host rendered at all. The kit would queue this call forever by
    // design; the app wrapper must refuse rather than leave the caller pending.
    jest.useFakeTimers({ doNotFake: ["performance"] });
    try {
      const answer = confirm({ title: "Delete everything?" });
      const failure = expect(answer).rejects.toThrow(
        /no <ConfirmDialogHost \/> is mounted/,
      );
      await jest.advanceTimersByTimeAsync(CONFIRM_HOST_WAIT_MS + 1000);
      await failure;
    } finally {
      jest.useRealTimers();
    }
  });
});
