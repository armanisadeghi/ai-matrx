/**
 * Surface manifest — Settings (`matrx-user/settings`).
 *
 * Drives `/user-settings/[[...path]]` — the route-driven settings surface
 * (`features/settings`, `SettingsRouteShell` + `SettingsTabContent` +
 * `SettingsTabHost`). The catch-all URL resolves to a tab id from the
 * settings registry ("general.notifications" ↔ /user-settings/general/
 * notifications); the bare `/user-settings` index resolves to NO tab (the
 * landing state), so the active-tab values are honest optionals.
 *
 * What the page loads: the resolved active tab's registry definition
 * (label, description, persistence tier), the visible sections tree (admin
 * tabs included only for admins), and the autosave flush status. The
 * individual setting VALUES on the open tab are NOT enumerable here — every
 * tab is a lazy-loaded component whose controls read Redux via `useSetting`
 * internally; there is no registry of per-tab setting keys to emit (see the
 * settings-system skill). The surface therefore describes WHERE the user is
 * and WHAT exists, not each field's current value.
 *
 * Runtime emitter: `features/settings/route-shell/SettingsTabContent.tsx`
 * (mounts `SurfaceRuntimeProvider` and assembles the scope at Run time via
 * `createSettingsScope`).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "active_section",
    label: "Active section",
    sortOrder: 100,
    description:
      "The settings tab the user currently has open, resolved from the URL.",
  },
  {
    key: "navigation",
    label: "Navigation",
    sortOrder: 200,
    description:
      "Every settings section visible to this user, and the visibility tier.",
  },
  {
    key: "sync_state",
    label: "Sync state",
    sortOrder: 300,
    description: "Autosave / preference-sync status of the settings store.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Active section ────────────────────────────────────────────────────
  {
    name: "active_tab_id",
    label: "Active tab id",
    description:
      'Registry id of the open settings tab (dot-notation, e.g. "ai.textGeneration"). Empty on the /user-settings index landing (no tab selected) or when the URL names a tab that does not exist.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 26,
    sortOrder: 300,
    group: "active_section",
  },
  {
    name: "active_tab_label",
    label: "Active tab label",
    description:
      "Display label of the open settings tab as shown in the tree and breadcrumb. Empty when no tab is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 310,
    group: "active_section",
  },
  {
    name: "active_tab_description",
    label: "Active tab description",
    description:
      "Short registry description of what the open tab configures. Empty when no tab is open or the tab has no description.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 320,
    group: "active_section",
  },
  {
    name: "active_tab_path",
    label: "Active tab URL",
    description:
      'Site-relative URL of the open tab (e.g. "/user-settings/ai/text-generation"). Empty when no tab is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 44,
    sortOrder: 330,
    group: "active_section",
  },
  {
    name: "active_tab_persistence",
    label: "Active tab persistence",
    description:
      'Where the open tab\'s settings are persisted: "synced" (saved to the user\'s account across devices), "local-only", or "session". Empty when no tab is open. Lets an agent tell the user whether changes here survive a refresh.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 340,
    group: "active_section",
  },
  {
    name: "active_tab",
    label: "Active tab",
    description:
      "Composite of the open tab as one object: { id, label, description, path, persistence, requires_admin }. Mirrors the individual active-section values (completeness law). Absent when no tab is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 350,
    group: "active_section",
  },

  // ── Navigation ────────────────────────────────────────────────────────
  {
    name: "settings_sections",
    label: "All settings sections",
    description:
      "Every settings tab (leaf) visible to this user, flattened from the sidebar tree: one entry per tab with { id, label, path }. Always populated. Admin-only tabs appear only when the user is an admin. The map for guiding the user to the right setting.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 3000,
    sortOrder: 400,
    group: "navigation",
  },
  {
    name: "is_admin_view",
    label: "Admin view",
    description:
      "True when the user is an admin and admin-only settings tabs are included in the visible tree. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 410,
    group: "navigation",
  },

  // ── Sync state ────────────────────────────────────────────────────────
  {
    name: "is_saving",
    label: "Saving in progress",
    description:
      "True while a preference autosave flush is in flight (the footer shows Saving…); false when everything is auto-saved and synced. Always populated.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 500,
    group: "sync_state",
  },
];

export const settingsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/settings",
  readiness: "verified",
  label: "Settings",
  urlPattern: "/user-settings",
  intro: `<surface_intro>
You are on Settings: the user's preference center, organized as a tree of sections (appearance, AI, voice, profile, integrations, …) with one tab open at a time.
The Active section group tells you WHERE the user is: which tab is open, what it configures, and its persistence tier ("synced" settings follow the account across devices; "local-only"/"session" reset). All active-tab values are absent on the /user-settings landing page before a section is chosen.
settings_sections is the full map of every section this user can see (each with its URL) — use it to point the user at the right place. The individual setting values inside a tab are NOT emitted here; you see where the user is, not each field's current state.
Everything auto-saves; is_saving reflects a flush in flight. Useful agent work here is navigation ("where do I change X?") and explaining what a section does or whether a change will sync.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("context"), surfaceSpecific),
};

/** One visible settings tab (leaf) as emitted in `settings_sections`. */
export interface SettingsSectionEntry {
  id: string;
  label: string;
  path: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createSettingsScope(values: {
  // alwaysAvailable: true → required
  settings_sections: SettingsSectionEntry[];
  is_admin_view: boolean;
  is_saving: boolean;
  // alwaysAvailable: false → optional (absent on the index landing)
  active_tab_id?: string;
  active_tab_label?: string;
  active_tab_description?: string;
  active_tab_path?: string;
  active_tab_persistence?: string;
  active_tab?: {
    id: string;
    label: string;
    description: string | null;
    path: string;
    persistence: string;
    requires_admin: boolean;
  };
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
