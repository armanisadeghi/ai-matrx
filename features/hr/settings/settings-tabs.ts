// features/hr/settings/settings-tabs.ts
//
// THE ROUTE-TAB MEMBERSHIP OF `/hr/settings/*` (SPEC-UI-IA §3.11, routes 67–81b) and
// the lane that owns each panel's contents.
//
// 🚨 EVERY TAB IS A REAL ROUTE. `HrSubShell` navigates; nothing here swaps client
// state. A tab whose panel is owned by another lane still gets a real route with an
// honest page behind it — an absent tab would mean an admin cannot discover that the
// setting exists at all, which is worse than a page that says who is building it.
//
// The section list itself lives in `features/hr/routes.ts` (`HR_SETTINGS_SECTIONS`)
// so the href builder and this file cannot disagree about what a section is called.

import {
  Bell,
  BellRing,
  BrainCircuit,
  Building2,
  CalendarDays,
  ClipboardList,
  Coins,
  FileSpreadsheet,
  KeyRound,
  ListTree,
  MessageSquare,
  Network,
  Settings2,
  ShieldCheck,
  Sun,
  Tablet,
  Timer,
  type LucideIcon,
} from "lucide-react";

import type { HrSettingsSection } from "../routes";

/** Which build lane owns the CONTENTS of a panel. L1 owns 67–73 and every shell. */
export type HrSettingsOwner =
  | "l1"
  | "leave"
  | "time"
  | "scheduling"
  | "access"
  | "workflow"
  | "notifications"
  | "ai"
  | "governance"
  | "onboarding"
  | "extensibility";

export type HrSettingsTabDef = {
  /** `null` is the hub itself (route 67). */
  section: HrSettingsSection | null;
  route: string;
  label: string;
  icon: LucideIcon;
  /** One line: what an admin decides here. Shown on the hub's section index. */
  purpose: string;
  owner: HrSettingsOwner;
};

/** Who to name when a panel is not L1's to build. */
export const HR_SETTINGS_OWNER_LABEL: Record<HrSettingsOwner, string> = {
  l1: "the employees & identity lane",
  leave: "the Leave & PTO lane",
  time: "the Time & Attendance lane",
  scheduling: "the Scheduling lane",
  access: "the Access lane",
  workflow: "the Workflow engine lane",
  notifications: "the Notifications lane",
  ai: "the HR AI lane",
  governance: "the records-governance lane",
  onboarding: "the Onboarding & offboarding lane",
  extensibility: "the platform extensibility lane (L14)",
};

export const HR_SETTINGS_TABS: HrSettingsTabDef[] = [
  {
    section: null,
    route: "67",
    label: "All settings",
    icon: Settings2,
    purpose:
      "Every configuration key HR reads, with its effective value and where that value came from.",
    owner: "l1",
  },
  {
    section: "employer",
    route: "68",
    label: "Employer",
    icon: Building2,
    purpose:
      "The legal entity of record, its establishments, its tax registrations, and which employment laws apply to it.",
    owner: "l1",
  },
  {
    section: "structure",
    route: "69",
    label: "Structure",
    icon: ListTree,
    purpose: "Departments, locations and job titles — the three things a person is assigned to.",
    owner: "l1",
  },
  {
    section: "pay-groups",
    route: "70",
    label: "Pay groups",
    icon: Coins,
    purpose: "Pay frequency, the period calendar, and the workweek every hour is counted in.",
    owner: "l1",
  },
  {
    section: "calendars",
    route: "71",
    label: "Calendars",
    icon: CalendarDays,
    purpose: "Holiday calendars and the holidays on them.",
    owner: "l1",
  },
  {
    section: "codes",
    route: "72",
    label: "Codes",
    icon: FileSpreadsheet,
    purpose:
      "The earning and deduction vocabulary timesheets and exports are written against.",
    owner: "l1",
  },
  {
    section: "fields",
    route: "73",
    label: "Custom fields",
    icon: ClipboardList,
    purpose: "Extra fields and tabs on HR records, and how sensitive each one is.",
    owner: "extensibility",
  },
  {
    section: "leave-policies",
    route: "74",
    label: "Leave policies",
    icon: Sun,
    purpose: "Accrual, caps, carryover and payout, per policy, per jurisdiction.",
    owner: "leave",
  },
  {
    section: "time-rules",
    route: "75",
    label: "Time rules",
    icon: Timer,
    purpose: "Rounding, overtime posture, breaks and attestation.",
    owner: "time",
  },
  {
    section: "devices",
    route: "75a",
    label: "Devices",
    icon: Tablet,
    purpose: "Kiosk pairing, naming, trust and revocation.",
    owner: "time",
  },
  {
    section: "schedule-rules",
    route: "76",
    label: "Schedule rules",
    icon: Network,
    purpose: "Conflicts, notice windows, fair-workweek posture and publish gating.",
    owner: "scheduling",
  },
  {
    section: "access",
    route: "77",
    label: "Access levels",
    icon: KeyRound,
    purpose: "Who can see and change what, over which people.",
    owner: "access",
  },
  {
    section: "workflows",
    route: "78",
    label: "Approvals",
    icon: ShieldCheck,
    purpose: "Who approves each kind of HR request, and what happens when they do not.",
    owner: "workflow",
  },
  {
    section: "notifications",
    route: "79",
    label: "Notifications",
    icon: Bell,
    purpose: "Which HR events notify people, on which channels.",
    owner: "notifications",
  },
  {
    section: "alerts",
    route: "79a",
    label: "Alerts",
    icon: BellRing,
    purpose: "Which roles receive which alert tiers, per channel.",
    owner: "notifications",
  },
  {
    section: "ai",
    route: "80",
    label: "AI",
    icon: BrainCircuit,
    purpose: "Every place AI helps in HR, how far it may go, and how often it runs.",
    owner: "ai",
  },
  {
    section: "retention",
    route: "81",
    label: "Retention",
    icon: ShieldCheck,
    purpose: "How long each record class is kept, what holds it, and how it is destroyed.",
    owner: "governance",
  },
  {
    section: "exit-surveys",
    route: "81a",
    label: "Exit surveys",
    icon: MessageSquare,
    purpose: "The questions asked when somebody leaves.",
    owner: "onboarding",
  },
];

export function hrSettingsTab(
  section: HrSettingsSection | null,
): HrSettingsTabDef | undefined {
  return HR_SETTINGS_TABS.find((tab) => tab.section === section);
}
