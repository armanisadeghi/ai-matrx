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
import { useSearchParams } from "next/navigation";
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
  // A link that names a run (`?conversationId=`) opens it for READING without
  // an organization — only starting a new run needs one, and the app asks for
  // it at Submit (ask-then-continue). The address is never touched here.
  const searchParams = useSearchParams();
  const readingARun = Boolean(searchParams?.get("conversationId"));
  return (
    <WorkspaceGate
      blocked={holder.organizationPending && !readingARun}
      // One word everywhere — the header, the picker and this line all say
      // "organization" — and the app says what it is, so the state is no void.
      sentence={`Choose an organization to run ${app.name?.trim() || "this app"}.`}
      description={app.tagline?.trim() || app.description?.trim() || ""}
    >
      {children}
    </WorkspaceGate>
  );
}
