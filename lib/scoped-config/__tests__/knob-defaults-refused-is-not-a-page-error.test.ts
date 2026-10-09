/**
 * The cold read starts `knob_defaults` beside `knob_snapshot_delta`. With no session yet both are refused
 * (anon: 42501); the delta's error is thrown and the defaults promise used to be left unhandled, which the
 * browser reported as "platform.knob_defaults could not answer: permission denied" on every Applet page.
 */
import { createClient } from "@/utils/supabase/client";
import { ensureKnobSnapshot } from "../effectiveKnobs";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => null }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({ registerDirectiveHandler: jest.fn() }));
jest.mock("../deviceId", () => ({ getWebDeviceId: () => null }));

it("a refused cold read rejects once, through the caller, and leaves no unhandled rejection", async () => {
  window.localStorage.clear();
  const refused = (fn: string) => Promise.resolve({ data: null, error: { message: `permission denied for function ${fn}` } });
  const rpc = (fn: string) => refused(fn);
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc }) } as unknown as ReturnType<typeof createClient>);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  await expect(ensureKnobSnapshot("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")).rejects.toThrow(/knob_snapshot_delta/);
  await new Promise((r) => setTimeout(r, 50));
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toEqual([]);
});
