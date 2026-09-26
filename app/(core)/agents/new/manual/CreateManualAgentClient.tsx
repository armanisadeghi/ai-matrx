"use client";

// The client half of `/agents/new/manual`.
//
// 🚨 WHY THIS EXISTS: the page creates an agent the moment it opens, and
// `agent.definition` is one of the 328 tables carrying
// `public._stamp_org_default` — a BEFORE INSERT trigger that files a row
// arriving with a NULL organization into the WRITER'S PERSONAL organization.
// The server action had no organization to write, so every agent made from a
// template silently landed in the creator's personal workspace instead of the
// organization they were working in (242 of 562 recent definitions).
//
// The organization a write acts in is the one the person SELECTED, so it is
// read HERE — from the store, on the client, where the selection lives — and
// carried into the action as an argument. Nothing below invents one:
// common-docs/policies/context-is-carried-never-rebuilt.md.
//
// Three honest states, never a fourth:
//   • bootstrap still resolving → the builder skeleton (it really is loading);
//   • resolved with no selection → `OrganizationRequiredNotice`, with the
//     picker attached; choosing one re-runs the create;
//   • the create refused → the refusal, in the person's words.

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

import { createAgentFromSeed } from "@/lib/agents/actions";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { BLANK_AGENT_SEED } from "@/features/agents/constants/blank-agent";
import { DesktopBuilderSkeleton } from "@/features/agents/components/builder/AgentBuilderSkeletons";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function CreateManualAgentClient() {
  const organizationId = useAppSelector(selectOrganizationId);
  // 🚨 THE FOURTH STATE IS NOT THE REFUSAL (R37): `orgBootstrapResolved` is
  // TRUE after a FAILED read too, so this page used to ask for a pick nobody
  // had checked was needed.
  const { organizationState } = useOrganizationRequired();
  const [error, setError] = useState<string | null>(null);
  // One create per resolved organization: the effect re-runs when the person
  // picks one, and must not fire twice for the same id (double mount, re-render).
  const createdFor = useRef<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    if (createdFor.current === organizationId) return;
    createdFor.current = organizationId;
    setError(null);
    void createAgentFromSeed(BLANK_AGENT_SEED, organizationId).catch(
      (err: unknown) => {
        // A successful create ends in `redirect()`, which Next turns into a
        // navigation rather than a value — anything that lands here is a real
        // refusal, and the person reads it instead of an empty screen.
        createdFor.current = null;
        setError(
          err instanceof Error
            ? err.message
            : "The agent could not be created just now.",
        );
      },
    );
  }, [organizationId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex max-w-md items-start gap-3 rounded-lg border border-border bg-card p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">
              The agent was not created
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{error} <ErrorAlchemyMenu error={error} /></p>
          </div>
        </div>
      </div>
    );
  }

  if (organizationState === "required" || organizationState === "unavailable") {
    return (
      <OrganizationContextNotice
        state={organizationState}
        what="A new agent"
        description="An agent belongs to one organization, and none is selected for this session, so nothing was created. Pick the organization you are working in and the agent will be created there."
      />
    );
  }

  return <DesktopBuilderSkeleton />;
}
