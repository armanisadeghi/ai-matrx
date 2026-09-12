/**
 * A toast that names a record must not outlive that record on screen
 * (FIX-R17 / FIX-Q12).
 *
 * These are forcing-function tests: they drive the REAL `components/ui/sonner`
 * Toaster, the REAL sonner renderer and the REAL `lib/toast` helpers in jsdom.
 * Nothing about toast lifetime is stubbed — the only double is `usePathname`,
 * because a route change is the input under test and there is no router in a
 * unit environment.
 *
 * The defect they pin: sonner reads `document.hidden` and PAUSES every dismiss
 * timer while the document is hidden (`useIsDocumentHidden`, sonner
 * dist/index.mjs). An agent browser pane, a background tab or a second window
 * all count as hidden, so «Created "A"» can still be on screen after the SPA
 * has client-side navigated to record B — a sentence the screen cannot back up.
 *
 * RED proof (run before believing these): in `lib/toast.ts`, make `raise()`
 * hand sonner the real duration instead of `Infinity` and delete the `arm()`
 * call — test 1 and test 3 fail. Remove the `useRecordToastLifetime()` line
 * from `components/ui/sonner.tsx` — test 2 fails.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

let currentPathname = "/mandates/AAAA-1111";
jest.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

import { Toaster } from "@/components/ui/sonner";
import {
  toast,
  recordToast,
  dismissRecordToasts,
  dismissAllRecordToasts,
  sweepExpiredRecordToasts,
  liveRecordToastRefs,
} from "@/lib/toast";

const RECORD_A = { type: "mandate", id: "AAAA-1111", title: "ZZZ Alpha" };

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

/** Put the document in the state that freezes every sonner timer. */
function hideDocument() {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => true,
  });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/**
 * The text a person can still read. Sonner keeps a dismissed `<li>` in the DOM
 * for its 200ms exit transition with `data-removed="true"` (it is invisible and
 * pointer-events:none by then), so a still-showing toast is a non-removed one.
 */
const toastText = () =>
  [...document.querySelectorAll('li[data-sonner-toast]:not([data-removed="true"])')]
    .map((li) => li.textContent ?? "")
    .join(" | ");

async function mountToaster() {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<Toaster />);
  });
}

beforeEach(async () => {
  currentPathname = "/mandates/AAAA-1111";
  await mountToaster();
});

afterEach(async () => {
  dismissAllRecordToasts();
  toast.dismiss();
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

/** Let sonner render the toast it was just handed. */
async function settle() {
  await act(async () => {
    await wait(0);
  });
}

async function navigateTo(pathname: string) {
  currentPathname = pathname;
  await act(async () => {
    root.render(<Toaster />);
  });
}

describe("a record toast cannot outlive its record on screen", () => {
  it("expires on the wall clock even while the document is hidden — a plain toast does not", async () => {
    hideDocument();

    await act(async () => {
      toast.success("Plain notice stays put", { duration: 60 });
      recordToast.success(RECORD_A, 'Created "ZZZ Alpha"', { duration: 60 });
    });
    await settle();
    expect(toastText()).toContain('Created "ZZZ Alpha"');

    await act(async () => {
      await wait(400);
    });

    // The plain toast is the defect, still frozen on screen: sonner's timer is
    // paused because the document is hidden. The record toast ran on our clock.
    expect(toastText()).toContain("Plain notice stays put");
    expect(liveRecordToastRefs()).toHaveLength(0);
    expect(toastText()).not.toContain("ZZZ Alpha");
  });

  it("is gone after a client-side navigation to another record, with the document hidden", async () => {
    hideDocument();

    await act(async () => {
      recordToast.success(RECORD_A, 'Created "ZZZ Alpha"', {
        duration: 60_000,
      });
    });
    await settle();
    expect(toastText()).toContain('Created "ZZZ Alpha"');
    expect(liveRecordToastRefs()).toHaveLength(1);

    await navigateTo("/mandates/BBBB-2222");
    // Sonner keeps a dismissed row mounted for its 200ms exit transition.
    await act(async () => {
      await wait(400);
    });

    expect(liveRecordToastRefs()).toHaveLength(0);
    expect(toastText()).not.toContain("ZZZ Alpha");
  });

  it("survives a navigation that stays on the same record", async () => {
    await act(async () => {
      recordToast.success(RECORD_A, 'Created "ZZZ Alpha"', {
        duration: 60_000,
      });
    });

    await settle();

    await navigateTo("/mandates/AAAA-1111/bindings");
    await act(async () => {
      await wait(0);
    });

    expect(liveRecordToastRefs()).toHaveLength(1);
    expect(toastText()).toContain("ZZZ Alpha");
  });

  it("survives a navigation to the record's own KEY-routed page", async () => {
    // The mandates admin routes by mandateKey, not id — a toast raised on
    // create and followed by a push to that record's page must survive it.
    await act(async () => {
      recordToast.success(
        { type: "mandate", id: "DDDD-4444", title: "zzz.fixq12.demo" },
        'Created "zzz.fixq12.demo"',
        { duration: 60_000 },
      );
    });
    await settle();

    await navigateTo("/administration/mandates/zzz.fixq12.demo");
    await act(async () => {
      await wait(0);
    });

    expect(liveRecordToastRefs()).toHaveLength(1);
    expect(toastText()).toContain("zzz.fixq12.demo");
  });

  it("does not keep a toast alive on a route that merely CONTAINS the id", async () => {
    await act(async () => {
      recordToast.success(
        { type: "mandate", id: "EEEE-5555", title: "alpha" },
        'Created "alpha"',
        { duration: 60_000 },
      );
    });
    await settle();

    // "alpha" is a word in this path, not the record it shows.
    await navigateTo("/administration/alphabetical/EEEE-5555-copy");
    await act(async () => {
      await wait(400);
    });

    expect(liveRecordToastRefs()).toHaveLength(0);
  });

  it("a duration:Infinity record toast is never swept by wall-clock expiry", async () => {
    hideDocument();
    await act(async () => {
      recordToast.info(RECORD_A, 'Renaming "ZZZ Alpha"…', {
        duration: Infinity,
      });
    });
    await settle();

    await act(async () => {
      await wait(50);
      // The sweep the Toaster runs when a hidden tab comes back, asked from
      // far in the future: an Infinity toast is due at no instant at all.
      sweepExpiredRecordToasts(Date.now() + 10 * 60_000);
      await wait(0);
    });

    expect(liveRecordToastRefs()).toHaveLength(1);
    expect(toastText()).toContain("ZZZ Alpha");
  });

  it("resolves when the record it names is deleted", async () => {
    await act(async () => {
      recordToast.success(RECORD_A, 'Created "ZZZ Alpha"', {
        duration: 60_000,
      });
      recordToast.info(RECORD_A, 'Renaming "ZZZ Alpha"', { duration: 60_000 });
      recordToast.success(
        { type: "mandate", id: "CCCC-3333", title: "Other" },
        'Created "Other"',
        { duration: 60_000 },
      );
    });
    await settle();
    expect(liveRecordToastRefs()).toHaveLength(3);

    let dismissed = 0;
    await act(async () => {
      dismissed = dismissRecordToasts({ type: "mandate", id: "AAAA-1111" });
      await wait(400);
    });

    expect(dismissed).toBe(2);
    expect(toastText()).not.toContain("ZZZ Alpha");
    expect(toastText()).toContain("Other");
    expect(liveRecordToastRefs()).toEqual([
      expect.objectContaining({ id: "CCCC-3333" }),
    ]);
  });
});
