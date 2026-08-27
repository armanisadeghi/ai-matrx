// features/hr/entry-points/MemberEmployeeSeam.tsx
//
// D3 / SPEC-UI-IA §6 — the member ⇄ employee seam on the org members list.
//
// "A member and an employee are related but distinct — this row is where the
//  seam is made visible and crossable."
//
// Three states, and each is a real, different fact:
//
//   LINKED             → "Employee record", a DOOR to `/hr/people/[id]`.
//   NOT LINKED         → "Link to employee", an ACTION (route 12, pre-filled
//                        with this member so nobody retypes a name we had).
//   MARKED NOT AN      → "Not an employee", plain text. Somebody decided this;
//   EMPLOYEE             the row says so instead of nagging forever.
//
// 🚨 AND A FOURTH, WHICH IS THE DEFAULT: ABSENT. HR off for this org, no HR
// standing, or the link door not live → the seam renders NOTHING. Not a
// disabled control, not "HR not enabled" — the sensitivity rule applies to
// modules too (SPEC-UI-IA §6).
//
// 🚨 ONE READ FOR THE WHOLE LIST, NOT ONE PER ROW. A members list is up to a
// few hundred rows and a per-row probe would be a few hundred audited calls.
// `HrMemberEmployeeSeamProvider` resolves the batch once; the row component
// only reads the answer.

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { IdCard, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchHrMemberEmployeeLinks } from "@/features/hr/service";
import { hrEmployeeHref, hrPeopleNewHref } from "@/features/hr/routes";

type SeamLink = {
  employeeId: string | null;
  displayName: string | null;
  markedNotEmployee: boolean;
};

type SeamValue = {
  byUserId: Record<string, SeamLink>;
  canLink: boolean;
  /** True until an answer arrives, and forever when there is no answer. */
  absent: boolean;
  orgRef: string;
};

const SeamContext = createContext<SeamValue | null>(null);

export function HrMemberEmployeeSeamProvider({
  organizationId,
  orgSlugOrId,
  userIds,
  children,
}: {
  organizationId: string;
  orgSlugOrId: string;
  userIds: string[];
  children: ReactNode;
}) {
  const [value, setValue] = useState<SeamValue>({
    byUserId: {},
    canLink: false,
    absent: true,
    orgRef: orgSlugOrId,
  });

  const key = userIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!organizationId || ids.length === 0) return;
    let cancelled = false;

    (async () => {
      const result = await fetchHrMemberEmployeeLinks({
        organizationId,
        userIds: ids,
      });
      if (cancelled) return;

      if (!result.ok) {
        // Refused, or the door is not live yet. ABSENT — never a broken link.
        setValue({
          byUserId: {},
          canLink: false,
          absent: true,
          orgRef: orgSlugOrId,
        });
        return;
      }

      const byUserId: Record<string, SeamLink> = {};
      for (const link of result.data.links ?? []) {
        byUserId[link.user_id] = {
          employeeId: link.employee_id,
          displayName: link.display_name,
          markedNotEmployee: link.marked_not_employee,
        };
      }
      setValue({
        byUserId,
        canLink: result.data.can_link,
        absent: false,
        orgRef: orgSlugOrId,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, orgSlugOrId, key]);

  return <SeamContext.Provider value={value}>{children}</SeamContext.Provider>;
}

export function MemberEmployeeSeam({
  userId,
  displayName,
}: {
  userId: string;
  /** Pre-fills the create form so nobody retypes a name we already had. */
  displayName?: string | null;
}) {
  const seam = useContext(SeamContext);
  // No provider, or no answer for this viewer → nothing at all.
  if (!seam || seam.absent) return null;

  const link = seam.byUserId[userId];
  if (!link) return null;

  if (link.employeeId) {
    return (
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2 text-xs"
      >
        <Link href={hrEmployeeHref(link.employeeId, null, { org: seam.orgRef })}>
          <IdCard className="h-3.5 w-3.5" />
          Employee record
        </Link>
      </Button>
    );
  }

  if (link.markedNotEmployee) {
    // Somebody decided. Say so once; do not offer the action again.
    return (
      <span className="px-2 text-xs text-muted-foreground">Not an employee</span>
    );
  }

  if (!seam.canLink) return null;

  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2 text-xs"
    >
      <Link
        href={hrPeopleNewHref({
          org: seam.orgRef,
          userId,
          name: displayName ?? null,
        })}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Link to employee
      </Link>
    </Button>
  );
}
