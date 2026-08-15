// Public API for the settings feature module.
// Tabs and the shell import ONLY from here.

export { useSetting, useSettingPersistence } from "./hooks/useSetting";
export {
  useSettingsSearch,
  countSearchHits,
  type SettingsSearchHit,
} from "./hooks/useSettingsSearch";
export {
  settingsRegistry,
  getVisibleTabs,
  getTabTree,
  getTabTreeNodes,
  findTab,
} from "./registry";
export type {
  SettingsPath,
  SettingsPersistence,
  SettingsTabDef,
  ResolvedSettingsTab,
} from "./types";
export {
  parseSettingsPath,
  getSliceBinding,
  sliceBindings,
  type SliceBinding,
} from "./slice-bindings";

// Shell components (Phase 4)
export { SettingsShell } from "./components/SettingsShell";
export type { SettingsShellProps } from "./components/SettingsShell";
export { SettingsTabHost } from "./components/SettingsTabHost";
export { SettingsShellOverlay } from "./components/SettingsShellOverlay";
export { SettingDoor } from "./doors/SettingDoor";
export {
  settingDoorHref,
  type SettingDoorTarget,
} from "./doors/settingDoorTarget";
export { SettingAnchor } from "./doors/SettingAnchor";
