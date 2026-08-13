"use client";

/**
 * One-click remedies shared by the console's Health column and the slot
 * workbench drawer. Every complaint the console can raise ships with its fix
 * (THE DOOR LAW — common-docs/policies/no-dead-ends.md): repin to an existing
 * system twin, create a twin and repin in one click, or open the Linked Agent
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
import { agentHref } from "./slot-health";
import { updateSlotDefinition, type SlotDefinitionRow } from "./service";

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
 * Repins the slot default at the linked system twin, tracking latest — a slot
 * pinned to a personal agent's version is already broken, so carrying that
 * version across would be meaningless.
 */
export function RepinToTwinButton({
  slot,
  twin,
  onSaved,
}: {
  slot: SlotDefinitionRow;
  twin: AgentLineageRef;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 gap-1 px-1.5 text-[11px]"
      disabled={busy}
      title={`Repin ${slot.slot_key} to the system agent "${twin.name}" (tracks latest)`}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await updateSlotDefinition(slot.id, {
            default_agent_id: twin.id,
            default_agent_version_id: null,
            use_latest: true,
          });
          // The toast names the agent it just repinned to and holds its id,
          // routed through `agentHref` so it opens in the right shell.
          toast.success(`${slot.slot_key} repinned to ${twin.name} (latest).`, {
            action: toastDoor("agent", twin.id, {
              href: agentHref(twin.id, twin.agentType),
            }),
          });
          onSaved();
        } catch (error: unknown) {
          toast.error(
            `Repin failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <ShieldCheck className="h-3 w-3" />
      )}
      Repin to system twin
    </Button>
  );
}

/** Opens the existing Linked Agent Sync window for an agent. Pass `slot` so
 * the diff inside knows WHICH slot it is judging and can repin it in place. */
export function LinkedSyncButton({
  agentId,
  label = "Linked Agent Sync…",
  slot,
}: {
  agentId: string;
  label?: string;
  slot?: SlotDefinitionRow;
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
          slotId: slot?.id,
          slotKey: slot?.slot_key,
          slotLabel: slot?.label ?? slot?.slot_key,
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
 * and immediately repin the slot to the new twin, tracking latest.
 */
export function CreateSystemTwinButton({
  slot,
  agentId,
  agentName,
  onSaved,
  label = "Create system twin + repin",
}: {
  slot: SlotDefinitionRow;
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
      title={`Duplicate ${agentName ?? "the pinned agent"} as a system agent and repin ${slot.slot_key} to the new twin (tracks latest)`}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        let twinId: string | null = null;
        try {
          twinId = await dispatch(
            duplicateAgent({ agentId, asSystem: true }),
          ).unwrap();
          await updateSlotDefinition(slot.id, {
            default_agent_id: twinId,
            default_agent_version_id: null,
            use_latest: true,
          });
          toast.success(
            `Created a system twin and repinned ${slot.slot_key} to it (latest).`,
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
            // reload so the repin can be finished in the editor.
            toast.error(
              `System twin created, but the repin failed: ${message}`,
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
