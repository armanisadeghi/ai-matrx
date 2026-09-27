import { Scale } from "lucide-react";
import { buildConfigTreeNodes } from "@/features/settings/universal/configTree";
import { settingsNavigationSections } from "./SettingsFlatNavigation";

// The desktop nav lists each Configuration domain through its Overview leaf.
// That leaf carried no icon, so every domain row fell back to the same gear
// (seen live on /user-settings, 2026-09-27). The domain's registry mark must
// reach the flat item.
describe("Configuration domains in the flat settings nav", () => {
  it("carry their domain icon, not the fallback", () => {
    const nodes = buildConfigTreeNodes([
      {
        id: "config.legal",
        slug: "legal",
        name: "Legal",
        knobs: [],
        features: [],
        domainLeafId: "config.legal.legal",
      },
    ]);
    const section = settingsNavigationSections(nodes).find((s) => s.label === "Configuration");
    const item = section?.items.find((i) => i.label === "Legal");
    expect(item?.node.icon).toBe(Scale);
  });
});
