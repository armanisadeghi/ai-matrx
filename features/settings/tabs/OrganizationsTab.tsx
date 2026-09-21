"use client";

import { Link2 } from "lucide-react";
import { OrganizationList } from "@/features/organizations/components/OrganizationList";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { useSetting } from "../hooks/useSetting";

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
      <SettingsSection
        title="Links from notifications and emails"
        description="Every link the platform sends you names the organization the thing it points at is filed under."
      >
        <SettingsSwitch
          icon={Link2}
          label="Switch organization when a link asks"
          description={
            switchWhenALinkAsks
              ? "On: following a link opens it in the organization it belongs to, and we tell you whenever that moves you out of the one you were working in. Links to organizations you are not a member of are always refused."
              : "Off: a link to another organization will not move you. We say which organization it is for and offer the switch as a click."
          }
          checked={switchWhenALinkAsks}
          onCheckedChange={setSwitchWhenALinkAsks}
          last
        />
      </SettingsSection>
      <OrganizationList />
    </div>
  );
}
