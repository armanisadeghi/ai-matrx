"use client";

import { Layers } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useSetting } from "../hooks/useSetting";

type LayoutStyle = "normal" | "extendedBottom" | "window";

export default function LayoutTab() {
  const [isInWindow, setIsInWindow] = useSetting<boolean>("layout.isInWindow");
  const [layoutStyle, setLayoutStyle] =
    useSetting<LayoutStyle>("layout.layoutStyle");

  return (
    <>
      <SettingsSubHeader
        title="Layout"
        description="Shell presentation mode."
        icon={Layers}
      />

      <SettingsCallout tone="warning">
        Applies until you reload. These layout choices are only kept for the
        current session.
      </SettingsCallout>

      <SettingsSection title="Presentation">
        <SettingsSegmented<LayoutStyle>
          label="Layout style"
          description="How the shell chrome arranges around content."
          value={layoutStyle}
          onValueChange={setLayoutStyle}
          options={[
            { value: "normal", label: "Normal" },
            { value: "extendedBottom", label: "Extended footer" },
            { value: "window", label: "Window mode" },
          ]}
          fullWidth
        />
        <SettingsSwitch
          label="Render inside a window frame"
          description="Wraps the shell inside a WindowPanel. Useful when embedding in another app."
          badge={{ label: "Experimental", variant: "experimental" }}
          checked={isInWindow}
          onCheckedChange={setIsInWindow}
          last
        />
      </SettingsSection>
    </>
  );
}
