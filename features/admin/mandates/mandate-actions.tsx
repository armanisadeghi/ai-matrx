"use client";

/**
 * One-click remedies shared by the console's Health column and the mandate
 * workbench drawer. Every complaint the console can raise ships with its fix
 * (THE DOOR LAW — common-docs/policies/no-dead-ends.md): rebind to an existing
 * system twin, create a twin and rebind in one click, or open the Linked Agent
 * Sync window for the advanced path.
 */

import { useState } from "react";
import { Copy, GitBranch, Link2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { duplicateAgent } from "@/features/agents/redux/agent-definition/thunks";
import type { AgentLineageRef } from "@/features/agents/redux/agent-definition/selectors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenAgentConvertSystemWindow } from "@/features/overlays/openers/agentConvertSystemWindow";
import { agentHref } from "./mandate-health";
import { useGuardedRebind } from "./useGuardedRebind";
import {
  updateMandateDefinition,
  type MandateCodeTruth,
  type MandateDefinitionRow,
} from "./service";

/** A lineage relative, always rendered with a door. */
export function LineageChip({
  label,
  agent,
  Icon = GitBranch,
}: {
  label: string;
  agent: AgentLineageRef;
  Icon?: typeof GitBranch;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]">
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <EntityRef
        token="agent"
        id={agent.id}
        name={agent.name}
        href={agentHref(agent.id, agent.agentType)}
        showIcon={false}
        alwaysShowActions
      />
      {agent.isSystem && (
        <Badge variant="outline" className="h-4 shrink-0 px-1 text-[9px]">
          system
        </Badge>
      )}
    </span>
  );
}

/**
 * The one-click fix that belongs next to the "NOT a system agent" complaint.
 * Rebinds the mandate default at the linked system twin, tracking latest — a mandate
 * pinned to a personal agent's version is already broken, so carrying that
 * version across would be meaningless.
 */
export function RebindToTwinButton({
  mandate,
  twin,
  currentAgentId,
  codeTruth,
  onSaved,
}: {
  mandate: MandateDefinitionRow;
  twin: AgentLineageRef;
  /** The agent bound today — the baseline the guard compares against. */
  currentAgentId: string | null;
  codeTruth?: MandateCodeTruth | null;
  onSaved: () => void;
}) {
  // THE GUARD. This exact button is what broke `podcast.deep_research`: the
  // console offered a correct remedy and applied it without checking whether
  // the twin declares the variables the mandate actually passes.
  const { requestRebind, dialog, checking, saving } = useGuardedRebind({
    mandate,
    currentAgentId,
    codeTruth,
    onSaved,
  });
  const busy = checking || saving;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-1.5 text-[11px]"
        disabled={busy}
        title={`Rebind ${mandate.mandate_key} to the system agent "${twin.name}" (tracks latest)`}
        onClick={(e) => {
          e.stopPropagation();
          void requestRebind({
            agentId: twin.id,
            agentName: twin.name,
            useLatest: true,
            successMessage: `${mandate.mandate_key} rebound to ${twin.name} (latest).`,
          });
        }}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <ShieldCheck className="h-3 w-3" />
        )}
        Rebind to system twin
      </Button>
      {dialog}
    </>
  );
}

/** Opens the existing Linked Agent Sync window for an agent. Pass `mandate` so
 * the diff inside knows WHICH mandate it is judging and can rebind it in place. */
export function LinkedSyncButton({
  agentId,
  label = "Linked Agent Sync…",
  mandate,
}: {
  agentId: string;
  label?: string;
  mandate?: MandateDefinitionRow;
}) {
  const openConvertSystem = useOpenAgentConvertSystemWindow();
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 gap-1 px-1.5 text-[11px]"
      title="Create or inspect this agent's linked system twin"
      onClick={(e) => {
        e.stopPropagation();
        openConvertSystem({
          agentId,
          mandateId: mandate?.id,
          mandateKey: mandate?.mandate_key,
          mandateLabel: mandate?.label ?? mandate?.mandate_key,
        });
      }}
    >
      <Link2 className="h-3 w-3" />
      {label}
    </Button>
  );
}

/**
 * ONE-CLICK promote: duplicate the pinned agent as a system agent
 * (`agx_duplicate_agent(p_as_system => true)` — super-admin-gated in the RPC)
 * and immediately rebind the mandate to the new twin, tracking latest.
 */
export function CreateSystemTwinButton({
  mandate,
  agentId,
  agentName,
  onSaved,
  label = "Create system twin + rebind",
}: {
  mandate: MandateDefinitionRow;
  agentId: string;
  agentName?: string;
  onSaved: () => void;
  label?: string;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 gap-1 px-1.5 text-[11px]"
      disabled={busy}
      title={`Duplicate ${agentName ?? "the pinned agent"} as a system agent and rebind ${mandate.mandate_key} to the new twin (tracks latest)`}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        let twinId: string | null = null;
        try {
          twinId = await dispatch(
            duplicateAgent({ agentId, asSystem: true }),
          ).unwrap();
          await updateMandateDefinition(mandate.id, {
            default_agent_id: twinId,
            default_agent_version_id: null,
            use_latest: true,
          });
          toast.success(
            `Created a system twin and rebound ${mandate.mandate_key} to it (latest).`,
            {
              action: toastDoor("agent", twinId, {
                href: agentHref(twinId, "builtin"),
              }),
            },
          );
          onSaved();
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (twinId) {
            // The twin exists — never bury that. Hand the admin its door and
            // reload so the rebind can be finished in the editor.
            toast.error(
              `System twin created, but the rebind failed: ${message}`,
              {
                action: toastDoor("agent", twinId, {
                  href: agentHref(twinId, "builtin"),
                }),
              },
            );
            onSaved();
          } else {
            toast.error(`Create system twin failed: ${message}`);
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {label}
    </Button>
  );
}
