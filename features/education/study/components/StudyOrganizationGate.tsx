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

import { useEffect, useRef, useState, type ReactNode } from "react";
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

/**
 * A study mode that starts on a CLICK (FastFire, spoken practice, audio review,
 * Grade My Work) keeps its setup visible with no organization chosen — only the
 * start holds. `start(...args)` runs the action at once when an organization is
 * ready; otherwise it holds the request (`held`), the surface shows
 * `<StudyOrganizationHoldNotice/>` at its start control, and the action runs by
 * itself — with the latest render's handler — as soon as one is picked. Nothing
 * is written before then.
 */
export function useHeldStudyStart<A extends unknown[]>(
  action: (...args: A) => unknown,
): {
  ready: boolean;
  held: boolean;
  start: (...args: A) => void;
  cancel: () => void;
} {
  const ready = useStudyOrganizationReady();
  const [heldArgs, setHeldArgs] = useState<A | null>(null);
  const latest = useRef(action);
  useEffect(() => {
    latest.current = action;
  });
  useEffect(() => {
    if (!ready || heldArgs === null) return;
    const args = heldArgs;
    setHeldArgs(null);
    void latest.current(...args);
  }, [ready, heldArgs]);
  return {
    ready,
    held: heldArgs !== null,
    start: (...args: A) => {
      if (ready) void action(...args);
      else setHeldArgs(args);
    },
    cancel: () => setHeldArgs(null),
  };
}

/** The organization notice shown at a held start control. */
export function StudyOrganizationHoldNotice({
  what,
  className,
}: {
  /** What is waiting, e.g. "Starting FastFire". */
  what: string;
  className?: string;
}) {
  return (
    <OrganizationRequiredNotice
      compact
      what={what}
      description="Every study session is filed under one organization. Pick the one you are working in and it starts."
      className={className ?? "rounded-lg border border-border bg-card"}
    />
  );
}
