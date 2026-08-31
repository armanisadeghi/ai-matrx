"use client";

/**
 * features/hr/leave/policies/leave-policy-menu.tsx — the right-click menu for a
 * `LeavePolicy`, shared by every surface that renders one as a record: the
 * policy list (a row per policy) and the policy editor (the single policy it
 * is open on). Future adopter: `LeavePolicyEditorSurface.tsx` — wrap its form
 * pane with the same section on next touch, so the two surfaces agree.
 *
 * No new write path: every item is a door to an existing route.
 */

import { ExternalLink, Users } from "lucide-react";

import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import type { HrOrgRef } from "@/features/hr/routes";
import { leavePolicyEnrollmentHref, leavePolicyHref } from "../manager/routes";
import type { LeavePolicy } from "../manager/api/types";

/** The policy as readable text — the menu's `content` value. */
export function leavePolicyMenuContent(policy: LeavePolicy | null): string {
  if (!policy) return "";
  return [
    policy.name ?? "Untitled policy",
    policy.isActive ? "Active" : "Draft",
    policy.enrolledCount !== null ? `${policy.enrolledCount} enrolled` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function leavePolicyMenuSection(
  policy: LeavePolicy | null,
  orgRef: HrOrgRef,
): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [
    {
      kind: "link",
      id: "leave-policy-open",
      label: "Open policy",
      icon: ExternalLink,
      href: policy ? leavePolicyHref(policy.id, orgRef) : "#",
      disabled: !policy,
      description: !policy ? "Right-click a policy to open it" : undefined,
    },
    {
      kind: "link",
      id: "leave-policy-enrollment",
      label: "See who's enrolled",
      icon: Users,
      href: policy ? leavePolicyEnrollmentHref(policy.id, orgRef) : "#",
      disabled: !policy || policy.enrolledCount === null,
      description: !policy
        ? "Right-click a policy first"
        : policy.enrolledCount === null
          ? "Enrolment count not provided"
          : undefined,
    },
  ];

  return { id: "leave-policy", label: "This policy", anchor: "after-compare", items };
}
