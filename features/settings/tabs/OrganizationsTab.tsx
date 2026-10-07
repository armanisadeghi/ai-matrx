"use client";

import { Link2 } from "lucide-react";
import { OrganizationList } from "@/features/organizations/components/OrganizationList";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { useSetting } from "../hooks/useSetting";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";
import { StartupOrganizationRow } from "@/features/organizations/components/StartupOrganizationRow";

export default function OrganizationsTab() {
  // The one knob for "a link named an organization — obey it?". It is a
  // PERSONAL preference (the person decides whether a link may move them), so
  // it lives in `userPreferences.organization`, not in `platform.feature_knob`
  // — nothing about it is org- or platform-governed.
  const [switchWhenALinkAsks, setSwitchWhenALinkAsks] = useSetting<boolean>(
    "userPreferences.organization.switchWhenALinkAsks",
  );

  return (
    <div className="p-4 md:p-6">
      <SettingsSection title="When you sign in">
        <StartupOrganizationRow last />
      </SettingsSection>
      <PreferencesLoadGate what="your link setting">
        {/* Every link the platform sends names the organization its target is filed under. */}
        <SettingsSection title="Links from notifications and emails">
          <SettingsSwitch
            icon={Link2}
            label="Switch organization when a link asks"
            description={
              switchWhenALinkAsks
                ? "On: a link opens in its organization; we say when you move."
                : "Off: links never move you; we offer the switch as a click."
            }
            helpText="Links to organizations you are not a member of are always refused."
            checked={switchWhenALinkAsks}
            onCheckedChange={setSwitchWhenALinkAsks}
            last
          />
        </SettingsSection>
      </PreferencesLoadGate>
      <OrganizationList />
    </div>
  );
}
