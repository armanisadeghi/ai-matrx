/** A signed-out visitor never asks `platform.knob_snapshot` (anon is refused: 42501 rows). */
const rpc = jest.fn(async (fn: string) => ({ data: fn === "knob_defaults" ? { version: "v", unchanged: false, defaults: {} } : { etag: "e", defaults_version: "v", unchanged: false, overrides: { "a.b": 1 } }, error: null }));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ rpc }) }),
}));
let userId: string | null = null;
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({ userAuth: { id: userId } }) }),
}));

import { ensureEffectiveKnob } from "../effectiveKnobs";

describe("ensureEffectiveKnob", () => {
  beforeEach(() => rpc.mockClear());
  it("signed out: no RPC, answers undefined", async () => {
    userId = null;
    await expect(ensureEffectiveKnob(null, null, { feature: "a", key: "b" })).resolves.toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("control: signed in reads the snapshot", async () => {
    userId = "u-1";
    await expect(ensureEffectiveKnob(null, "u-1", { feature: "a", key: "b" })).resolves.toBe(1);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
