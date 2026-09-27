import type { ScopedKnob } from "@/lib/scoped-config/types";
import { domainsWithChangeableSettings, type SettingsDomain } from "../UniversalSettingsContext";

// Ruling 2026-09-27: a person's own settings list only the product areas that
// hold at least one setting they can change; the admin view keeps them all.
const knob = (key: string, locked = false) =>
  ({ full_key: key, user_override_locked: locked }) as unknown as ScopedKnob;
const domain = (slug: string, knobs: ScopedKnob[], features: ScopedKnob[][] = []): SettingsDomain => ({
  id: `config.${slug}`,
  slug,
  name: slug,
  knobs,
  features: features.map((k, i) => ({ id: `config.${slug}.f${i}`, slug: `f${i}`, name: `f${i}`, knobs: k })),
  domainLeafId: `config.${slug}.${slug}`,
});

describe("areas on the person's own settings", () => {
  it("drops empty areas, empty features and areas whose every key is locked", () => {
    const result = domainsWithChangeableSettings([
      domain("empty", []),
      domain("locked", [knob("a", true)]),
      domain("feature-only", [], [[], [knob("b")]]),
      domain("direct", [knob("c")]),
    ]);
    expect(result.map((d) => d.slug)).toEqual(["feature-only", "direct"]);
    expect(result[0].features.map((f) => f.slug)).toEqual(["f1"]);
  });
});
