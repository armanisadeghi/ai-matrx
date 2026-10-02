"use client";

// features/meet/components/MeetingOrgScope.tsx
//
// AN EXISTING MEETING RUNS IN ITS OWN ORGANIZATION, NEVER THE ACTIVE ONE
// (`common-docs/policies/access-ladder.md`, rule 5).
//
// The app-wide `<MeetHost>` is bound to the ACTIVE organization — the place new
// meetings are created. A record surface for a meeting in ANOTHER organization
// (its chat log, activity, recap, recording) reads through `host.api`, which
// stamps that host's organization on every server call. So when the ambient host
// is inert or bound elsewhere, this wraps the record in a member-lane
// `<MeetProvider>` scoped to the MEETING's organization (the person's own
// session — never a guest). When the ambient host already matches, it renders
// the children untouched: there is never a second provider beside a matching one.

import { useState, type ReactNode } from "react";
import { MeetProvider, useMeetHost } from "@ai-matrx/meet/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizations } from "@/features/scopes/redux/selectors/tree";
import { useMeetMemberIdentity } from "@/providers/MeetHost";

export function MeetingOrgScope({
  organizationId,
  fallback = null,
  children,
}: {
  /** The meeting's own organization. */
  organizationId: string;
  /** Shown when the person is not a member of that organization. */
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const host = useMeetHost();
  const organizations = useAppSelector(selectOrganizations);
  const member = organizations[organizationId] !== undefined;
  const matches = host !== null && host.identity.organizationId === organizationId;
  // Latched: once scoped, a later org switch never rebuilds a live surface.
  const [scoped, setScoped] = useState(false);
  if (!scoped && !matches && member) setScoped(true);

  if (scoped) return <ScopedMember organizationId={organizationId}>{children}</ScopedMember>;
  if (matches || host !== null) return <>{children}</>;
  return <>{fallback}</>;
}

function ScopedMember({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const identity = useMeetMemberIdentity();
  return (
    <MeetProvider {...identity} organizationId={organizationId}>
      {children}
    </MeetProvider>
  );
}
