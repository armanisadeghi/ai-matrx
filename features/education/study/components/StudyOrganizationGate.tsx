"use client";

// features/education/study/components/StudyOrganizationGate.tsx
//
// Every study mode opens a `study_session`, and a session is filed under one
// organization. With none chosen, the session write raises the blocking
// "Which workspace?" prompt the moment the page loads. A study surface instead
// passes `enabled={ready}` to its hook (so nothing is written yet) and wraps its
// deck in this gate: the organization notice with the picker, in place, and the
// deck starts on its own once one is chosen. While the organization is still
// being read, the deck's own loading state shows.

import type { ReactNode } from "react";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationRequiredNotice } from "@/features/organizations/components/OrganizationRequiredNotice";

/** True once a study session can be written without a blocking prompt. */
export function useStudyOrganizationReady(): boolean {
  return useOrganizationRequired().organizationState === "ready";
}

export function StudyOrganizationGate({
  what,
  children,
}: {
  /** What cannot start yet, e.g. "This drill" or "Practicing Krebs Cycle". */
  what: string;
  children: ReactNode;
}) {
  const { organizationState } = useOrganizationRequired();
  if (organizationState === "ready" || organizationState === "resolving") {
    return <>{children}</>;
  }
  return (
    <div className="flex h-full items-start justify-center overflow-y-auto p-4 pt-10">
      <OrganizationRequiredNotice
        what={what}
        description="Studying records what you answer, and every study session is filed under one organization. Pick the one you are working in and it starts."
        className="w-full max-w-md rounded-xl border border-border bg-card"
      />
    </div>
  );
}
