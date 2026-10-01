/**
 * GUARD — no persisted slice joins the registry without an answer to "what
 * happens to the saved copy when this slice is written before it is read?"
 *
 * Boot reads persisted state AFTER the page is interactive (window load +
 * idle). A slice whose body is a whole map/object, written in that window,
 * stores only what this page knows over everything saved on the device
 * (2026-09-30: `wizardDraft` lost the stopped-run record; `scopesTree` stored
 * `{}` over the warm tree as soon as a fetch went pending).
 *
 * Every persisted policy must therefore be one of:
 *   - `holdUntilHydrated: true` — device write waits for the read (warm-cache);
 *   - `persistWhen` — the slice's own "saved record loaded" gate;
 *   - listed in EARLY_WRITE_IS_SAFE with the reason an early write cannot
 *     erase anything (the body is the person's newest single choice, or a
 *     server-owned copy rewritten on every load).
 * A new slice fails here until its author picks one.
 */
import { syncPolicies } from "@/lib/sync/registry";
import { getPreset } from "@/lib/sync/policies/presets";

const EARLY_WRITE_IS_SAFE: Record<string, string> = {
  theme:
    "boot-critical; body is one scalar (mode) the person just chose — the newest value is the right one to keep",
  userProfile:
    "boot-critical; body is the server's display metadata, rewritten from auth on every shell load — nothing local to lose",
  appContext:
    "body is one active-org choice (id + name); an early write is the person's newest choice, and the cookie + remote reconcile own the truth",
};

describe("every persisted slice is classified for writes made before the read", () => {
  const persisted = syncPolicies.filter((p) => getPreset(p.config.preset).persists);

  it.each(persisted.map((p) => [p.config.sliceName, p] as const))(
    "%s holds its device write, gates on its load, or says why an early write is safe",
    (sliceName, policy) => {
      const held = policy.config.holdUntilHydrated === true;
      const gated = typeof policy.config.persistWhen === "function";
      const exempt = (EARLY_WRITE_IS_SAFE[sliceName] ?? "").length > 0;
      if (!held && !gated && !exempt) {
        throw new Error(
          `"${sliceName}" persists to the device but declares neither holdUntilHydrated nor persistWhen, ` +
            `and is not in EARLY_WRITE_IS_SAFE. A write before boot's read would replace the saved copy. ` +
            `Turn on holdUntilHydrated (warm-cache) or record why an early write cannot erase anything.`,
        );
      }
    },
  );

  it("no exemption names a slice that is gone or that is already held", () => {
    const bySlice = new Map(persisted.map((p) => [p.config.sliceName, p]));
    for (const name of Object.keys(EARLY_WRITE_IS_SAFE)) {
      const policy = bySlice.get(name);
      expect(policy).toBeDefined();
      expect(policy?.config.holdUntilHydrated === true).toBe(false);
    }
  });
});
