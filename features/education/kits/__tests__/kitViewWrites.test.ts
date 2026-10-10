import { educationKitsManifest } from "@/features/surfaces/manifests/education-kits.manifest";
import { KIT_WRITE_TARGET_VIEWS, kitOutOfViewWrites, type KitSurfaceView } from "../kitWrites";

const VIEWS: KitSurfaceView[] = ["list", "detail", "new"];

describe("one kits surface, three views", () => {
  it("names the owning views of every declared write target (no target without an owner)", () => {
    const declared = (educationKitsManifest.writeTargets ?? []).map((t) => t.name).sort();
    expect(Object.keys(KIT_WRITE_TARGET_VIEWS).sort()).toEqual(declared);
    for (const name of declared) expect(KIT_WRITE_TARGET_VIEWS[name].length).toBeGreaterThan(0);
  });

  it("every view either owns a declared target or refuses it itself: nothing is left without a handler", () => {
    const declared = (educationKitsManifest.writeTargets ?? []).map((t) => t.name);
    for (const view of VIEWS) {
      const refusals = Object.keys(kitOutOfViewWrites(view));
      const owned = declared.filter((n) => KIT_WRITE_TARGET_VIEWS[n].includes(view));
      expect([...refusals, ...owned].sort()).toEqual([...declared].sort());
      expect(refusals.filter((n) => owned.includes(n))).toEqual([]);
    }
  });

  it("refuses before approval, in words that say where the write works", () => {
    const handler = kitOutOfViewWrites("detail").create_kits;
    expect(() => handler.validate({})).toThrow(/create_kits works on the new kit page, not on an open kit/);
    expect(() => handler.apply({})).toThrow(/Nothing was changed/);
  });
});
