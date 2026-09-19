/**
 * THE GESTURE BUDGET on this side of the wire.
 *
 * "Open in my browser" is meant to open the extension's side panel, and the
 * only reason Chrome permits that is the click the person just made. A page
 * gets roughly five seconds of transient activation from a click; the message
 * has to leave inside it. Measured in matrx-extend
 * `tests/browser/side-panel-gesture-spike.mjs` on Chrome 153: a 2s pause before
 * sending still opened the panel, a 6s pause did not.
 *
 * `detectExtensionId` costs a round trip per candidate id, and when the Store
 * build is the one installed it waits out the unpacked id's full 1.5s timeout
 * first. Probing on the click path could therefore spend most of the budget
 * before the real message was sent — and the failure is silent: the hand-off
 * still works, the panel just never appears.
 *
 * So: when the id is already known, the click path sends STRAIGHT AWAY. These
 * assertions are about ORDER AND COUNT of wire calls, not about speed, because
 * a timing assertion would be a flake and this rule is structural.
 */

import {
  forgetRememberedExtensionId,
  getRememberedExtensionId,
} from "@/lib/extension-bridge/chrome-rpc";

type Reply = { ok: boolean; result?: unknown; error?: string };

/** Every message this page sent, in order, with the id it went to. */
let wire: Array<{ id: string; action: string }> = [];
/** Replies keyed by extension id — an id that is not here does not answer. */
let answering: Record<string, boolean> = {};

function installChrome(): void {
  wire = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (
        id: string,
        message: { action: string },
        callback: (reply: Reply) => void,
      ) => {
        wire.push({ id, action: message.action });
        if (!answering[id]) {
          // A candidate that is not installed never calls back; the real
          // transport times out. Reproduce that rather than replying "no".
          return;
        }
        const reply: Reply =
          message.action === "ping"
            ? { ok: true, result: { pong: true } }
            : {
                ok: true,
                result: {
                  organizationSwitched: true,
                  organizationName: "AI Matrx",
                  panelOpened: true,
                  panelReason: "opened",
                  waitingCount: 2,
                },
              };
        setTimeout(() => callback(reply), 0);
      },
    },
  };
}

const STORE_ID = "hnfolienncfklkgmdjjmhhegglimlamg";
const UNPACKED_ID = "cihdmkcdjjckfhjpgoedmgfpoljebaml";
const ORG = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

describe("handing the queue over inside the click's gesture", () => {
  beforeEach(() => {
    jest.useRealTimers();
    installChrome();
    answering = {};
    forgetRememberedExtensionId();
  });

  it("sends the hand-off with NO probe first once the install is known", async () => {
    answering[STORE_ID] = true;
    const { hasOwnBrowserExtension, handToOwnBrowser } = await import(
      "@/lib/extension-bridge/handToOwnBrowser"
    );

    // What every surface offering this button already does, long before the
    // click: decide whether the extension is there at all.
    await expect(hasOwnBrowserExtension()).resolves.toBe(true);
    expect(getRememberedExtensionId()).toBe(STORE_ID);

    wire = [];
    const outcome = await handToOwnBrowser({ organizationId: ORG });

    // THE INVARIANT: the first thing the click sends is the hand-off itself.
    expect(wire).toEqual([{ id: STORE_ID, action: "captureHandoff.pickUp" }]);
    expect(outcome).toMatchObject({ kind: "handed_over", panelOpened: true });
  });

  it("asks every candidate at once, never one timeout after another", async () => {
    answering[STORE_ID] = true;
    const { detectExtensionId } = await import(
      "@/lib/extension-bridge/chrome-rpc"
    );
    const found = await detectExtensionId(undefined, { timeoutMs: 40 });
    expect(found?.id).toBe(STORE_ID);
    // Both pings are on the wire before either could have timed out; serially
    // the unpacked id's timeout would have had to elapse before the store id
    // was ever asked.
    expect(wire.map((w) => w.id)).toEqual([UNPACKED_ID, STORE_ID]);
  });

  it("forgets an install that stops answering, so the next try probes again", async () => {
    answering[STORE_ID] = true;
    const { hasOwnBrowserExtension, handToOwnBrowser } = await import(
      "@/lib/extension-bridge/handToOwnBrowser"
    );
    await hasOwnBrowserExtension();
    expect(getRememberedExtensionId()).toBe(STORE_ID);

    // Uninstalled between the render and the click.
    answering = {};
    const outcome = await handToOwnBrowser({ organizationId: ORG });
    expect(outcome.kind).toBe("refused");
    expect(getRememberedExtensionId()).toBeNull();
    // The real transport waits its full 8s before calling a silent extension
    // gone; that wait is the behaviour under test, so the budget is explicit.
  }, 15_000);

  it("still hands over when nothing was remembered, rather than refusing", async () => {
    answering[STORE_ID] = true;
    const { handToOwnBrowser } = await import(
      "@/lib/extension-bridge/handToOwnBrowser"
    );
    const outcome = await handToOwnBrowser({ organizationId: ORG });
    expect(outcome).toMatchObject({ kind: "handed_over" });
  });

  it("says the panel opened, in the receipt a person reads", async () => {
    const { handedOverSentence } = await import(
      "@/lib/extension-bridge/handToOwnBrowser"
    );
    const opened = handedOverSentence({
      organizationName: "AI Matrx",
      organizationSwitched: false,
      panelOpened: true,
      waitingCount: 2,
    });
    expect(opened).toContain("panel just opened");
    expect(opened).not.toContain("toolbar");

    // And when it genuinely did not, the sentence still names the one step
    // left instead of claiming a panel that is not there.
    const shut = handedOverSentence({
      organizationName: "AI Matrx",
      organizationSwitched: false,
      panelOpened: false,
      waitingCount: 2,
    });
    expect(shut).toContain("Matrx icon in your Chrome toolbar");
  });
});
