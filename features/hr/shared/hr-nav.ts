// features/hr/shared/hr-nav.ts
//
// THE HR NAV TREE, resolved per persona and per CAPABILITY (SPEC-UI-IA §2.1/§2.2).
//
// 🚨 VISIBILITY IS CAPABILITY-DRIVEN. `persona` picks the LABEL and the destination
// ("My Timesheet" → `/hr/me/timesheet` rather than "Time" → `/hr/time`); the
// `requires` list decides whether the item exists at all. A custom Access Level that
// grants timesheet approval and nothing else gets Time and inherits none of the rest.
//
// 🚨 ABSENT, NOT DISABLED. An item this person cannot use is not in the array. There
// is no greyed nav item anywhere in HR, and that includes the whole module: with
// `hr.module.enabled = false` the caller renders no HR nav at all (§6).
//
// Pure data + one pure resolver, so nav can be reasoned about without a React tree.

import {
  BarChart3,
  Briefcase,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  GraduationCap,
  Home,
  ListTodo,
  type LucideIcon,
  Megaphone,
  Package,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  User,
  Users,
} from "lucide-react";

import type { HrCapability, HrPersona } from "../constants";
import type { HrActiveEmployer } from "../types";
import {
  hrAssetsHref,
  hrComplianceHref,
  hrDocumentsHref,
  hrEngagementHref,
  hrHiringHref,
  hrHref,
  hrLeaveHref,
  hrMeDocumentsHref,
  hrMeHref,
  hrMeScheduleHref,
  hrMeTimeOffHref,
  hrMeTimesheetHref,
  hrMeTrainingHref,
  hrOnboardingHref,
  hrPeopleHref,
  hrPerformanceHref,
  hrReportsHref,
  hrScheduleHref,
  hrSettingsHref,
  hrTasksHref,
  hrTimeHref,
  hrTrainingHref,
  type HrOrgRef,
} from "../routes";

type HrNavDef = {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  href: (org: HrOrgRef) => string;
  exact?: boolean;
  /** ANY of these is enough. Omitted → every persona with an employer sees it. */
  requires?: HrCapability[];
  /**
   * The employee-persona face of this item: a different label pointing at the
   * person's own `/hr/me/*` surface. Present → this item counts toward the
   * self-service collapse rule.
   */
  self?: {
    label: string;
    href: (org: HrOrgRef) => string;
    /** Needs an active spell today. No spell → the item is ABSENT. */
    needsEmployment?: boolean;
    /*
      🚨 WORKER CLASSES THIS ENTRY IS ABSENT FOR — NAV MUST NOT OFFER WHAT THE
      SERVER REFUSES. A contractor was shown a "My Timesheet" entry whose
      destination `hr.clock_state` blocks outright ("Contractors do not clock in.
      Your time is invoiced through your engagement."), while her own profile had
      already dropped the matching tab. The nav and the tab bar were describing
      the same person differently, and the nav was the one that was wrong.

      This mirrors a rule the SERVER already enforces — it never invents one. Each
      entry below names where its verdict comes from. §4.2: absence, not a
      disabled item and not an explainer panel.
    */
    hiddenForWorkerClass?: readonly string[];
    /*
      🚨 A PER-CLASS DEFAULT THAT A PER-PERSON FACT CAN OVERRIDE.

      Unlike `hiddenForWorkerClass` above, this is not a verdict — it is what is
      true of a class *by default*. Leave is the one self-service surface with a
      designed per-person exception: SPEC-LEAVE §2.8 lets HR enrol somebody
      outside a policy's worker class deliberately, with a recorded reason, and
      `hr_leave_enroll`'s override door creates exactly that person. A static
      list cannot express her, and while it governed leave she could hold a
      balance, file a request and have it approved without ever finding the page.

      The flag can only ever REVEAL, never hide: an absent or false flag leaves
      the class default exactly as it was, so no payload regression can strip a
      menu that a class list was not already stripping.
    */
    hiddenForWorkerClassUnlessEnrolled?: readonly string[];
  };
};

/** Contractors do not clock and are not scheduled: their time is invoiced. */
const NOT_CLOCKED = ["contractor"] as const;
/** No leave accrual, so no balance to show — the same rule the hire form applies. */
const NO_LEAVE_ACCRUAL = ["contractor", "volunteer"] as const;

const NAV: HrNavDef[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    description: "What needs you today",
    href: hrHref,
    exact: true,
  },
  {
    key: "me",
    label: "My Info",
    icon: User,
    description: "Your own record — always yours, in every role",
    href: hrMeHref,
  },
  {
    key: "people",
    label: "People",
    icon: Users,
    description: "The employee directory and the org chart",
    href: (org) => hrPeopleHref({ org }),
  },
  {
    key: "hiring",
    label: "Hiring",
    icon: Briefcase,
    description: "Requisitions, candidates, interviews and offers",
    href: hrHiringHref,
    requires: ["requisition.manage", "candidate.read"],
  },
  {
    key: "time",
    label: "Time",
    icon: Clock,
    description: "Timesheets, punches, exceptions and pay periods",
    href: hrTimeHref,
    requires: ["time.read"],
    self: {
      label: "My Timesheet",
      href: hrMeTimesheetHref,
      needsEmployment: true,
      // `hr.clock_state` blocks a contractor outright, naming the reason.
      hiddenForWorkerClass: NOT_CLOCKED,
    },
  },
  {
    key: "schedule",
    label: "Schedule",
    icon: CalendarDays,
    description: "Build, publish and staff the schedule",
    href: hrScheduleHref,
    requires: ["working_record.read"],
    self: {
      label: "My Schedule",
      href: hrMeScheduleHref,
      needsEmployment: true,
      // Not on the shift roster for the same reason they do not clock.
      hiddenForWorkerClass: NOT_CLOCKED,
    },
  },
  {
    key: "leave",
    label: "Time Off",
    icon: Sun,
    description: "Requests, balances and the team calendar",
    href: hrLeaveHref,
    requires: ["working_record.read"],
    self: {
      label: "My Time Off",
      href: hrMeTimeOffHref,
      needsEmployment: true,
      // These classes do not accrue leave BY DEFAULT — but a §2.8 override
      // enrolment is a real, reasoned, recorded exception, and the server tells
      // us about it. Enrolment decides; class is only the default.
      hiddenForWorkerClassUnlessEnrolled: NO_LEAVE_ACCRUAL,
    },
  },
  {
    key: "onboarding",
    label: "Onboarding",
    icon: ClipboardList,
    description: "New-hire runs, templates and offboarding",
    href: hrOnboardingHref,
    requires: ["working_record.read"],
  },
  {
    key: "documents",
    label: "Documents",
    icon: FileText,
    description: "The library, acknowledgments and signatures",
    href: hrDocumentsHref,
    requires: ["working_record.read"],
    self: { label: "My Documents", href: hrMeDocumentsHref },
  },
  {
    key: "training",
    label: "Training",
    icon: GraduationCap,
    description: "Assignments, certifications and compliance",
    href: hrTrainingHref,
    requires: ["working_record.read"],
    self: { label: "My Training", href: hrMeTrainingHref, needsEmployment: true },
  },
  {
    key: "performance",
    label: "Performance",
    icon: Target,
    description: "Reviews — yours, and your team's",
    href: hrPerformanceHref,
  },
  {
    key: "assets",
    label: "Assets",
    icon: Package,
    description: "Equipment issued, assigned and recovered",
    href: hrAssetsHref,
    requires: ["working_record.read"],
  },
  {
    key: "engagement",
    label: "Engagement",
    icon: Megaphone,
    description: "Announcements, pulse surveys and recognition",
    href: hrEngagementHref,
  },
  {
    key: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    description: "Exceptions, work authorization and access review",
    href: hrComplianceHref,
    requires: ["records.govern", "audit.read"],
  },
  {
    key: "tasks",
    label: "Tasks",
    icon: ListTodo,
    description: "Everything waiting on a decision from you",
    href: hrTasksHref,
  },
  {
    key: "reports",
    label: "Reports",
    icon: BarChart3,
    description: "Headcount, turnover, cost and compliance reporting",
    href: hrReportsHref,
    requires: ["working_record.read"],
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    description: "How HR works for this employer",
    href: (org) => hrSettingsHref(null, { org }),
    requires: ["identity.write"],
  },
];

export type HrNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  exact?: boolean;
};

export type HrNavResolution = {
  items: HrNavItem[];
  /**
   * SPEC-UI-IA §2.2: when the persona is `employee` and fewer than four
   * self-service surfaces are enabled, the nav renders FLAT — a warehouse worker
   * sees five links, not a tree with one leaf each.
   */
  flat: boolean;
  selfServiceCount: number;
};

/**
 * Resolve the nav for one person in one employer.
 *
 * `capabilities` is the raw list from `hr_my_context().active.capabilities`, which
 * the server computed from `hr.access_role` — never a client-side guess.
 */
export function resolveHrNav(args: {
  persona: HrPersona | null;
  capabilities: string[];
  employmentId: string | null;
  org: HrOrgRef;
  /*
    🚨 THE WHOLE CONTEXT, NOT A LIST OF FLAGS — AND REQUIRED, SO IT CANNOT BE
    FORGOTTEN.

    Every per-person honesty rule below is DERIVED from this payload here, once.
    It used to arrive as separate optional flags (`workerClass`, then
    `hasLeaveEnrolment`), and the two call sites of this one resolver diverged
    TWICE: each time a flag was added, the second caller kept rendering the
    unfiltered menu, and each fix opened its mirror. Optional honesty arguments
    do that by construction — the safe default that protects the caller who
    passes nothing is exactly what makes the omission silent.

    `active` is a required KEY with a nullable VALUE: a caller with no employer
    must say so explicitly, and cannot simply leave the argument out. A null
    payload hides NOTHING, because an unknown person must never have their menu
    silently stripped.
  */
  active: HrActiveEmployer | null;
}): HrNavResolution {
  const { persona, employmentId, org, active } = args;
  const workerClass = active?.worker_class ?? null;
  const hasLeaveEnrolment = active?.has_active_leave_enrolment ?? null;
  const held = new Set(args.capabilities);
  const isEmployee = persona === "employee";

  const items: HrNavItem[] = [];
  let selfServiceCount = 0;

  for (const def of NAV) {
    // The employee face first: an employee never gets the org-wide surface even
    // when a stray capability would have matched, because the self surface IS
    // their version of this item.
    if (isEmployee && def.self) {
      if (def.self.needsEmployment && !employmentId) continue;
      // Absent for this worker class — the destination would refuse them, and the
      // profile has already dropped the matching tab. Not counted toward the
      // collapse rule either: an item that does not exist cannot make the nav feel full.
      if (
        workerClass &&
        def.self.hiddenForWorkerClass?.includes(workerClass)
      ) {
        continue;
      }
      // The same absence rule, but overridable per person by a real enrolment.
      // `!== true` is deliberate: only a positive answer reveals, so an absent
      // or unreadable flag can never hide something the class list would have
      // shown.
      if (
        workerClass &&
        def.self.hiddenForWorkerClassUnlessEnrolled?.includes(workerClass) &&
        hasLeaveEnrolment !== true
      ) {
        continue;
      }
      selfServiceCount += 1;
      items.push({
        key: def.key,
        label: def.self.label,
        href: def.self.href(org),
        icon: def.icon,
        description: def.description,
      });
      continue;
    }

    if (isEmployee && def.requires) continue;
    if (def.requires && !def.requires.some((c) => held.has(c))) continue;

    items.push({
      key: def.key,
      label: def.label,
      href: def.href(org),
      icon: def.icon,
      description: def.description,
      exact: def.exact,
    });
  }

  return { items, flat: isEmployee && selfServiceCount < 4, selfServiceCount };
}
