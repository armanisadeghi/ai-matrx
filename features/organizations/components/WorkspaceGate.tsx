"use client";

// WorkspaceGate — a waiting screen that never waits on a workspace nobody will
// pick.
//
// THE CLASS (2026-09-26): mandate-driven chat hosts (a War Room thread chat,
// the Scribe assistant, the Masterwork build, the interview drive) showed a
// spinner while "the workspace" was not ready. Which agent runs a job depends
// on the active workspace, and the no-default-organization rule means nobody
// picks one for the person — so once boot has SETTLED with nothing chosen, the
// spinner is waiting on something that will never happen. A screen that lies.
//
// This wraps the host's own loading UI: unless the host says it is BLOCKED on
// the workspace, or while the organization is ready or still resolving, the children (the spinner or skeleton) render unchanged —
// that wait is real. When boot settled with no workspace (or the read failed,
// or the person is signed out), the SAME area shows the one honest notice:
// the host's own sentence plus the canonical workspace picker behind one
// button (`OrganizationContextNotice` → `OrganizationPickerPopover`). Picking one
// selects it; the mandate cache drops on the switch, the host re-resolves and
// loads. Nothing is ever chosen for the person.
//
// USAGE (in place of the host's spinner — no new rows):
//   <WorkspaceGate blocked={assistant.blockedOnWorkspace} sentence="This thread needs a workspace to open.">
//     <Loader2 className="animate-spin" />
//   </WorkspaceGate>

import type { ReactNode } from "react";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";

export interface WorkspaceGateProps {
  /**
   * The host is waiting BECAUSE no workspace is chosen (its Mandate refused
   * with the organization-unresolved error, or `useMandate` said
   * `organizationPending`). Required, never inferred: "boot settled with no
   * workspace" is not proof — an ordinary load that happens while the header
   * says "Choose org" must keep its spinner (verifier round 1, F-B1: a War
   * Room thread flashed "needs a workspace" and then opened without one).
   */
  blocked: boolean;
  /** One plain sentence naming what needs the workspace, e.g. "This thread needs a workspace to open." */
  sentence: string;
  /** One optional line under it — what the host is, so the state is not a void. */
  description?: string;
  /** The host's own waiting UI, shown while the wait is real. */
  children: ReactNode;
  /** Framed-card form for a host that is already inside a small panel. */
  compact?: boolean;
  className?: string;
}

export function WorkspaceGate({ sentence, description = "", blocked, children, compact = false, className }: WorkspaceGateProps) {
  const { organizationState } = useOrganizationRequired();
  if (!blocked || organizationState === "ready" || organizationState === "resolving") {
    return <>{children}</>;
  }
  return (
    <div
      data-testid="workspace-gate"
      className={className ?? "flex h-full min-h-0 w-full flex-col overflow-y-auto"}
    >
      <OrganizationContextNotice
        state={organizationState}
        title={sentence}
        description={description}
        compact={compact}
      />
    </div>
  );
}
