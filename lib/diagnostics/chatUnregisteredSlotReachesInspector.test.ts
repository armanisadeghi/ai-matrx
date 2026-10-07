/**
 * Law 4 guard: a chat-package stand-in (an unregistered host slot) must reach
 * the app's Error Inspector store, which is what persistCapturedErrors files to
 * the platform errors system. Runs the real package seam against the real
 * app diagnostics port and the real store; only the host lookup is stubbed.
 * Fresh module copies (jest.setup already loaded the seams).
 */
export {};

type Store = typeof import("@/lib/diagnostics/errorCaptureStore");
type Persist = typeof import("@/lib/diagnostics/persistCapturedErrors");

describe("an unregistered chat host slot is recorded, not just logged", () => {
  it("lands once per slot in the Error Inspector as a durable, persistable row", () => {
    jest.resetModules();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.doMock("../../../aidream/apps/shared/chat/src/host/configure", () => {
      const { createAppChatDiagnostics } = require("@/lib/diagnostics/chat-diagnostics-port");
      const host = { diagnostics: createAppChatDiagnostics() };
      return {
        getChatHost: () => host,
        isChatHostConfigured: () => true,
        onChatHostConfigured: () => () => {},
      };
    });
    const store = require("@/lib/diagnostics/errorCaptureStore") as Store;
    const { shouldPersistCapturedTier } = require("@/lib/diagnostics/persistCapturedErrors") as Persist;
    const { reportUnregisteredHostSlot } = require("../../../aidream/apps/shared/chat/src/host/diagnostics");
    store.clearCapturedErrors();

    reportUnregisteredHostSlot("slot.under.test", "a stand-in runs");
    reportUnregisteredHostSlot("slot.under.test", "a stand-in runs");

    const rows = store.getSnapshot().filter((e) => e.source === "surface-registration");
    expect(rows).toHaveLength(1);
    expect(rows[0].callSite).toBe("chat-host-slot:slot.under.test");
    expect(rows[0].durable).not.toBe(false);
    expect(rows[0].tier).toBe("red");
    expect(
      shouldPersistCapturedTier({ tier: rows[0].tier, isGuest: true, createdAt: null, now: Date.now() }),
    ).toBe(true);
  });
});
