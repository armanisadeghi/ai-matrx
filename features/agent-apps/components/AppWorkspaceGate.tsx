"use client";

/**
 * NO WORKSPACE CHOSEN IS A QUESTION, NEVER A RUN ERROR.
 *
 * Which agent runs an app's job depends on the signed-in person's active
 * organization, and nobody picks one for them (the no-default-organization
 * law). Every shell used to print the resolver's refusal as
 * `execution_error: mandate "app.…" cannot resolve yet…` — an internal key
 * and a failure, twice, on first paint, before the person did anything.
 *
 * The one gate in `AgentAppPublicRenderer` covers every shell (built-in,
 * fully custom, code preview): while the holder reports
 * `organizationPending`, the app's area shows the person's memberships inline
 * (`WorkspaceGate` → `OrganizationContextNotice` → `OrganizationPickerPanel`).
 * Picking one makes it the active organization, the mandate cache drops on
 * the switch, the holder re-resolves and the app renders — the held request
 * proceeds. Guests never reach it (their lane reads the public RPC's columns).
 */

import type { ReactNode } from "react";
import { useAppHolder } from "@/features/agent-apps/lib/appHolder";
import { WorkspaceGate } from "@/features/organizations/components/WorkspaceGate";
import type { PublicAgentApp } from "@/features/agent-apps/types";

export function AppWorkspaceGate({
  app,
  children,
}: {
  app: PublicAgentApp;
  children: ReactNode;
}) {
  const holder = useAppHolder(app);
  return (
    <WorkspaceGate
      blocked={holder.organizationPending}
      sentence={`${app.name?.trim() || "This app"} needs a workspace to run.`}
    >
      {children}
    </WorkspaceGate>
  );
}
