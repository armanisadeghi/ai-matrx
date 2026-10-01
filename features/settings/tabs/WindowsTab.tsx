"use client";

import { AppWindow, EyeOff, Eye, Minimize2, LayoutGrid } from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  minimizeAll,
  restoreAll,
  toggleWindowsHidden,
} from "@/lib/redux/slices/windowManagerSlice";

export default function WindowsTab() {
  const dispatch = useAppDispatch();
  const windowsHidden = useSelector(
    (s: RootState) => s.windowManager.windowsHidden,
  );
  const windowCount = useSelector(
    (s: RootState) => Object.keys(s.windowManager.windows).length,
  );
  const minimizedCount = useSelector(
    (s: RootState) =>
      Object.values(s.windowManager.windows).filter(
        (w) => w.state === "minimized",
      ).length,
  );

  const handleMinimizeAll = () => {
    if (typeof window === "undefined") return;
    dispatch(
      minimizeAll({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }),
    );
  };

  return (
    <>
      <SettingsSubHeader
        title="Windows"
        description="Global actions for every floating window on this screen."
        icon={AppWindow}
      />

      <SettingsCallout tone="info">
        Window state is <strong>session-only</strong> — these actions affect
        only the current tab and reset on reload.
      </SettingsCallout>

      <SettingsSection title="Status" icon={LayoutGrid}>
        <SettingsReadOnlyValue
          label="Open windows"
          value={String(windowCount)}
        />
        <SettingsReadOnlyValue
          label="Minimized"
          value={String(minimizedCount)}
        />
        <SettingsReadOnlyValue
          label="Visibility"
          value={windowsHidden ? "Hidden" : "Visible"}
          last
        />
      </SettingsSection>

      <SettingsSection title="Actions">
        <SettingsButton
          label={windowsHidden ? "Show all windows" : "Hide all windows"}
          description="Hide every window without closing it."
          actionLabel={windowsHidden ? "Show" : "Hide"}
          actionIcon={windowsHidden ? Eye : EyeOff}
          kind="outline"
          onClick={() => dispatch(toggleWindowsHidden())}
        />
        <SettingsButton
          label="Minimize all windows"
          description="Collapse every windowed panel into the tray."
          actionLabel="Minimize all"
          actionIcon={Minimize2}
          kind="outline"
          disabled={windowCount === 0}
          onClick={handleMinimizeAll}
        />
        <SettingsButton
          label="Restore all windows"
          description="Bring every minimized window back to its previous size."
          actionLabel="Restore all"
          actionIcon={LayoutGrid}
          kind="default"
          disabled={minimizedCount === 0}
          onClick={() => dispatch(restoreAll())}
          last
        />
      </SettingsSection>
    </>
  );
}
