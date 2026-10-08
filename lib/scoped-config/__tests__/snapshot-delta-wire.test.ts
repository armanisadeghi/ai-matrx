/**
 * KNOB-SNAPSHOT: the client ships the platform values ONCE and asks for a difference after that.
 * Fails against the old client (which asked `knob_snapshot` for the whole register every time).
 */
import { createClient } from "@/utils/supabase/client";
import { ensureKnobSnapshot, invalidateEffectiveKnob, peekEffectiveKnob } from "../effectiveKnobs";

jest.mock("@/utils/supabase/client", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => null }));
jest.mock("@/lib/client-directives/directiveRegistry", () => ({ registerDirectiveHandler: jest.fn() }));
jest.mock("../deviceId", () => ({ getWebDeviceId: () => null }));

const ORG = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];

function serve(overrides: Record<string, unknown>, etag: string) {
  const rpc = (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === "knob_defaults") {
      return Promise.resolve({
        data: { version: "d1", unchanged: args.p_known_version === "d1", defaults: { "a.b": 50, "c.d": "x" } },
        error: null,
      });
    }
    if (fn === "knob_snapshot_delta") {
      return Promise.resolve({
        data:
          args.p_etag === etag
            ? { etag, defaults_version: "d1", unchanged: true }
            : { etag, defaults_version: "d1", unchanged: false, overrides },
        error: null,
      });
    }
    throw new Error(`unexpected rpc ${fn}`);
  };
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc }) } as unknown as ReturnType<typeof createClient>);
}

beforeEach(() => {
  calls.length = 0;
  window.localStorage.clear();
});

it("merges defaults with the person's difference, then skips the payload on an unchanged etag", async () => {
  serve({ "a.b": 25 }, "e1");
  await ensureKnobSnapshot(ORG, USER);
  expect(peekEffectiveKnob(ORG, USER, "a.b")).toBe(25);
  expect(peekEffectiveKnob(ORG, USER, "c.d")).toBe("x");
  expect(calls.map((c) => c.fn).sort()).toEqual(["knob_defaults", "knob_snapshot_delta"]);

  calls.length = 0;
  invalidateEffectiveKnob();
  await ensureKnobSnapshot(ORG, USER);
  // defaults are kept; the delta is re-asked with the etag and answered "unchanged"
  expect(calls.map((c) => c.fn)).toEqual(["knob_snapshot_delta"]);
  expect(calls[0].args.p_etag).toBe("e1");
  expect(peekEffectiveKnob(ORG, USER, "a.b")).toBe(25);
});
