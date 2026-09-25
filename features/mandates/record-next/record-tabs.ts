// features/mandates/record-next/record-tabs.ts
//
// THE TEN MANDATE TABS, SHORT LABELS — the copy built beside the protected
// workspace (common-docs/systems/intelligence/mandates/UI-REGISTER.md, "Protected tabs" and
// item 6b: "Tabs must fit on one row with shorter names").
//
// The tab IDS are the workspace's own (`MandateWorkspaceTab`) so every tab body
// mounts unchanged; only the words on the tab change. Old → new:
//
//   definition    "Definition"       → "Definition"
//   holder        "Holder"           → "Binding"     ("Holder" alone is never shown)
//   create-agent  "Create Agent"     → "New agent"
//   overrides     "Overrides"        → "Overrides"
//   display       "Display Options"  → "Display"
//   test          "Test"             → "Test"        (admin bench; member
//                                                     seats get their own
//                                                     try panel)
//   permissions   "Permissions"      → "Access"
//   source        "Source & Usage"   → "Usage"       (admin)
//   diagnostics   "Diagnostics"      → "Health"      (admin)
//   notes         "Notes"            → "Notes"
//
// Plus one tab that exists only here, beside the protected Overrides tab:
//   overrides-simple → "Overrides (simple)" — `MandateOverridesSimple`
//   (features/mandates/overrides-simple/), the simple redesign the owner asked
//   for: the current agent's settings, each with a way to override it.

import { ADMIN_MANDATES_HOME, adminMandateRecordHref } from "@/features/mandates/admin-routes";
import {
  Activity,
  Bot,
  Code2,
  FileText,
  FlaskConical,
  ListChecks,
  Link2,
  MonitorCog,
  NotebookPen,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { MandateWorkspaceTab } from "@/features/mandates/workspace/MandateWorkspace";

export type RecordTabId = MandateWorkspaceTab | "overrides-simple";

export interface RecordTab {
  id: RecordTabId;
  label: string;
  icon: LucideIcon;
  /** Only where the old workspace showed it: the admin route / super admins. */
  admin?: boolean;
  /**
   * Reached from a header ACTION, never from the tab row (review 2026-09-25:
   * "New agent" is something you do, not a place you read). The id stays a
   * valid `?tab=` so its protected body mounts exactly as before.
   */
  action?: boolean;
}

export const RECORD_TABS: readonly RecordTab[] = [
  { id: "definition", label: "Definition", icon: FileText },
  { id: "holder", label: "Binding", icon: Link2 },
  { id: "create-agent", label: "New agent", icon: Bot, action: true },
  { id: "overrides", label: "Overrides", icon: SlidersHorizontal },
  { id: "overrides-simple", label: "Overrides (simple)", icon: ListChecks },
  { id: "display", label: "Display", icon: MonitorCog },
  { id: "test", label: "Test", icon: FlaskConical, admin: true },
  { id: "permissions", label: "Access", icon: ShieldCheck },
  { id: "source", label: "Usage", icon: Code2, admin: true },
  { id: "diagnostics", label: "Health", icon: Activity, admin: true },
  { id: "notes", label: "Notes", icon: NotebookPen },
];

export const DEFAULT_RECORD_TAB: RecordTabId = "definition";

/** The tabs in the ROW — every tab except the ones reached by a header action. */
export function tabRowOf(tabs: readonly RecordTab[]): readonly RecordTab[] {
  return tabs.filter((tab) => !tab.action);
}

/** The tabs a viewer sees. `admin` tabs only when the host shows admin tools. */
export function visibleRecordTabs(showAdmin: boolean): readonly RecordTab[] {
  return RECORD_TABS.filter((tab) => !tab.admin || showAdmin);
}

/** A `?tab=` value read back into a tab id, or the default for anything else. */
export function parseRecordTab(
  value: string | null | undefined,
  showAdmin: boolean,
): RecordTabId {
  return parseRecordTabFrom(value, visibleRecordTabs(showAdmin));
}

/** A `?tab=` value read back against an explicit tab set. */
export function parseRecordTabFrom(
  value: string | null | undefined,
  tabs: readonly RecordTab[],
): RecordTabId {
  const found = tabs.find((tab) => tab.id === value);
  if (found) return found.id;
  // A member seat has ONE Overrides tab (the simple one); an old
  // `?tab=overrides` link lands on it rather than on Definition.
  if (value === "overrides" && tabs.some((tab) => tab.id === "overrides-simple")) {
    return "overrides-simple";
  }
  return DEFAULT_RECORD_TAB;
}

/**
 * Which seat the record page is opened from. `system` is the admin route
 * (every tab); `person` and `organization` are the member pages, where the
 * admin tabs are ABSENT (never disabled) whoever is looking — a super admin on
 * a member page sees what a member sees.
 */
export type RecordLevel = "system" | "person" | "organization";

/** Tabs a read-only seat (an organization member who does not manage it)
 * sees. Test is among them: trying a job runs it as the viewer, charged to
 * the viewer, and changes nothing. */
const READ_ONLY_TAB_IDS: readonly RecordTabId[] = ["definition", "holder", "test", "notes"];

/**
 * The tabs for a seat. Pure. A member seat gets its OWN Test tab (the
 * level-aware try panel, `MandateTryPanel`) — testing the current or a new
 * configuration belongs to every level (MANDATE-SYSTEM.md §2); the other
 * admin tabs (Usage, Health) stay absent there.
 */
export function recordTabsForLevel(
  level: RecordLevel,
  options: { readOnly?: boolean } = {},
): readonly RecordTab[] {
  if (level === "system") return visibleRecordTabs(true);
  if (options.readOnly) {
    return RECORD_TABS.filter((tab) => READ_ONLY_TAB_IDS.includes(tab.id));
  }
  // ONE Overrides tab per level (review 2026-09-25): a member seat keeps the
  // simple one, named plainly; the admin route keeps both side by side.
  return RECORD_TABS.filter(
    (tab) => (!tab.admin || tab.id === "test") && tab.id !== "overrides",
  ).map((tab) => (tab.id === "overrides-simple" ? { ...tab, label: "Overrides" } : tab));
}

/** Where the record's Back goes when this tab did not come from a mandate list. */
export const MANDATE_LIST_PREVIEW_HREF = ADMIN_MANDATES_HOME;

/** The new record page's address — the window's "open in a new tab" uses it. */
export function mandateRecordPreviewHref(
  mandateKey: string,
  tab?: RecordTabId,
): string {
  const base = adminMandateRecordHref(mandateKey);
  return tab && tab !== DEFAULT_RECORD_TAB ? `${base}?tab=${tab}` : base;
}
