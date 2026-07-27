import type { ComponentType, LazyExoticComponent } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Where a setting ultimately lives.
 * - synced: hits IDB + localStorage mirror + Supabase via the sync engine
 * - local-only: in-memory Redux only; survives current session, NOT a refresh
 * - session: in-memory, cleared when the window is reloaded (same as local-only today)
 *
 * "local-only" flags slices that should be migrated to a sync policy later.
 * Tabs can surface this info to the user ("Changes saved automatically" vs
 * "This setting resets on refresh").
 */
export type SettingsPersistence = "synced" | "local-only" | "session";

/**
 * A dotted path identifying a specific setting: `slice.key` or `slice.module.preference`.
 * Examples:
 *   - "theme.mode"
 *   - "userPreferences.prompts.defaultTemperature"
 *   - "adminPreferences.serverOverride"
 */
export type SettingsPath = string;

/** Tab definition used by the registry. */
export type SettingsTabDef = {
  /** Unique id — use dotted slug to match path structure (e.g. "userPreferences.prompts"). */
  id: string;
  /** Human-readable label shown in tree/drawer/breadcrumb. */
  label: string;
  /** Lucide icon for the tree/drawer row. */
  icon: LucideIcon;
  /** Parent tab id — omit for top-level tabs. */
  parentId?: string;
  /** Short description shown under the label in the drawer and in breadcrumbs. */
  description?: string;
  /** Extra keywords searched alongside label/description. */
  searchKeywords?: string[];
  /** Lazy-loaded tab component. */
  component: ComponentType<Record<string, never>>;
  /** True to hide from non-admin users. */
  requiresAdmin?: boolean;
  /** True by default — set false only for onboarding/guest-visible tabs. */
  requiresAuth?: boolean;
  /** Where every setting on this tab is ultimately persisted. Used to surface badges ("Local only"). */
  persistence: SettingsPersistence;
};

/** Derived tab with children pre-resolved. Returned by the tree builder. */
export type ResolvedSettingsTab = SettingsTabDef & {
  children?: ResolvedSettingsTab[];
};
