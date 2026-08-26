"use client";

// features/hr/people/directory/useHrEmployeeMenu.tsx
//
// 🚨 ONE `ItemMenuConfig` PER ENTITY. Every place a person can be acted on — a
// directory row, a card, an org-chart node, the profile header — builds its menu
// HERE. A second hand-rolled action list beside this one is the fork the item
// system exists to prevent, and it is how two surfaces end up disagreeing about
// whether this viewer may start an offboarding.
//
// 🚨 CAPABILITY-GATED ACTIONS ARE ABSENT, NEVER DISABLED (SPEC-EMPLOYEES §1.3,
// §2.2 route 10). `hidden: true` removes the entry; there is deliberately no
// call site here that sets `disabled` on a capability. A greyed "Start
// offboarding" tells a manager that the capability exists and that they do not
// have it — which is exactly the disclosure the rule forbids.
//
// The four doors (Open · New tab · Peek · Window) are NOT in this menu: they are
// the row's own `HrPersonDoor` controls, always present, never behind a kebab.
// The menu carries the VERBS.

import { useCallback } from "react";
import {
  ArrowRightLeft,
  ClipboardList,
  DoorOpen,
  ExternalLink,
  IdCard,
  ListTodo,
  Mail,
  Network,
  Users,
} from "lucide-react";

import type { ItemMenuConfig } from "@/components/official/item/types";
import { useOpenTaskQuickCreateWindow } from "@/features/overlays/openers/taskQuickCreateWindow";
import { announceComingSoon } from "@/lib/coming-soon/announce";

import type { HrCapability } from "../../constants";
import {
  hrEmployeeHref,
  hrOrgChartHref,
  hrPartyHref,
  hrPeopleHref,
  type HrOrgRef,
} from "../../routes";

export type HrEmployeeMenuSubject = {
  employeeId: string;
  displayName: string;
  /** The CRM party this employee is 1:1 with, when the viewer holds it. */
  partyId?: string | null;
  workEmail?: string | null;
  /** null when this person has no employment — offboarding is then ABSENT. */
  employmentId?: string | null;
  directReportCount?: number | null;
  status?: string | null;
};

export type HrEmployeeMenuBuilder = (
  subject: HrEmployeeMenuSubject,
) => ItemMenuConfig;

/**
 * `can` is `useHrPersona().can` — the live capability set the server computed.
 * Never a persona string test: a custom Access Level that grants
 * `identity.write` and nothing else must get the offboarding verb without
 * inheriting the rest (SPEC-UI-IA §2.2).
 */
export function useHrEmployeeMenu(args: {
  org: HrOrgRef;
  can: (capability: HrCapability) => boolean;
}): HrEmployeeMenuBuilder {
  const { org, can } = args;
  const openTaskQuickCreate = useOpenTaskQuickCreateWindow();

  return useCallback(
    (subject: HrEmployeeMenuSubject): ItemMenuConfig => {
      const canOffboard = can("identity.write") && Boolean(subject.employmentId);
      const alreadyGone = subject.status === "terminated";

      return {
        header: { title: subject.displayName },
        sections: [
          {
            id: "open",
            items: [
              {
                kind: "link",
                id: "open",
                label: "Open profile",
                icon: IdCard,
                href: hrEmployeeHref(subject.employeeId, null, { org }),
              },
              {
                kind: "link",
                id: "open-new-tab",
                label: "Open in a new tab",
                icon: ExternalLink,
                href: hrEmployeeHref(subject.employeeId, null, { org }),
                target: "_blank",
              },
              {
                kind: "link",
                id: "org-chart",
                label: "Show on the org chart",
                icon: Network,
                href: hrOrgChartHref({ org, focus: subject.employeeId }),
              },
              {
                kind: "link",
                id: "direct-reports",
                label: "Their direct reports",
                icon: Users,
                // A count is a door, and so is the absence of one: the entry is
                // hidden when we know there are none, rather than opening an
                // empty list the viewer did not ask for.
                hidden: (subject.directReportCount ?? 0) === 0,
                href: hrPeopleHref({ org, managerEmployeeId: subject.employeeId }),
              },
              {
                kind: "link",
                id: "crm-party",
                label: "Open the CRM record",
                icon: ArrowRightLeft,
                hidden: !subject.partyId,
                href: subject.partyId ? hrPartyHref(subject.partyId) : "#",
                target: "_blank",
              },
            ],
          },
          {
            id: "act",
            label: "Actions",
            items: [
              {
                id: "message",
                label: "Message",
                icon: Mail,
                description: subject.workEmail ?? undefined,
                // A person with no work email cannot be messaged; the verb is
                // absent rather than offering an action that cannot complete.
                hidden: !subject.workEmail,
                onSelect: () => void announceComingSoon("hr.people.message"),
              },
              {
                id: "assign-task",
                label: "Assign a task",
                icon: ListTodo,
                onSelect: () => {
                  openTaskQuickCreate({
                    source: {
                      entity_type: "hr_employee",
                      entity_id: subject.employeeId,
                      label: subject.displayName,
                    },
                    prePopulate: { title: `${subject.displayName}: ` },
                  });
                },
              },
              {
                id: "start-offboarding",
                label: "Start offboarding",
                icon: DoorOpen,
                tone: "destructive",
                // ABSENT without the capability — never a greyed row.
                hidden: !canOffboard || alreadyGone,
                onSelect: () =>
                  void announceComingSoon("hr.people.start-offboarding"),
              },
              {
                id: "assign-training",
                label: "Assign training",
                icon: ClipboardList,
                hidden: !can("working_record.read"),
                onSelect: () =>
                  void announceComingSoon("hr.people.assign-training"),
              },
            ],
          },
        ],
      };
    },
    [can, openTaskQuickCreate, org],
  );
}
