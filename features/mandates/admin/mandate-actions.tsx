"use client";

/**
 * One-click remedies shared by the console's Health column and the mandate
 * workbench drawer. Every complaint the console can raise ships with its fix
 * (THE DOOR LAW — common-docs/policies/no-dead-ends.md): rebind to an existing
 * system twin, create a twin and rebind in one click, or open the Linked Agent
 * Sync window for the advanced path.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  GitBranch,
  Link2,
  Loader2,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { toast, recordToast } from "@/lib/toast";
import { toastDoor } from "@/components/official/entity-ref/toastDoor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { duplicateAgent } from "@/features/agents/redux/agent-definition/thunks";
import type { AgentLineageRef } from "@/features/agents/redux/agent-definition/selectors";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { useOpenAgentConvertSystemWindow } from "@/features/overlays/openers/agentConvertSystemWindow";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { SYSTEM_ORGANIZATION_ID } from "@/constants/platform-orgs";
import { agentHref } from "./mandate-health";
import { useGuardedRebind } from "./useGuardedRebind";
import { promoteMandateToSystem } from "./promotion";
import type { MandateCodeTruth, MandateDefinitionRow } from "./service";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";

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
 *
 * 🚨 THE REBIND WRITE GOES THROUGH THE GUARD. This button used to call
 * `updateMandateDefinition` directly — the ONE unguarded rebind path left in
 * the console, sitting inches from the guarded one. A duplicate is usually a
 * clean swap, so the guard usually writes straight through and the admin sees
 * nothing; when it is not clean, the same impact dialog every other rebind
 * gets appears here too. There is now exactly one rebind write path.
 */
export function CreateSystemTwinButton({
  mandate,
  agentId,
  agentName,
  codeTruth,
  onSaved,
  label = "Create system twin + rebind",
}: {
  mandate: MandateDefinitionRow;
  agentId: string;
  agentName?: string;
  codeTruth?: MandateCodeTruth | null;
  onSaved: () => void;
  label?: string;
}) {
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  const { requestRebind, dialog, checking, saving } = useGuardedRebind({
    mandate,
    currentAgentId: agentId,
    codeTruth,
    onSaved,
  });
  const working = busy || checking || saving;
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-1.5 text-[11px]"
        disabled={working}
        title={`Duplicate ${agentName ?? "the pinned agent"} as a system agent and rebind ${mandate.mandate_key} to the new twin (tracks latest)`}
        onClick={async (e) => {
          e.stopPropagation();
          setBusy(true);
          let twinId: string | null = null;
          try {
            twinId = await dispatch(
              duplicateAgent({ agentId, asSystem: true }),
            ).unwrap();
            await requestRebind({
              agentId: twinId,
              agentName: agentName ?? "the new system twin",
              useLatest: true,
              successMessage: `Created a system twin and rebound ${mandate.mandate_key} to it (latest).`,
            });
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
        {working ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
        {label}
      </Button>
      {dialog}
    </>
  );
}

/**
 * PROMOTE THE MANDATE — the sibling of `CreateSystemTwinButton` above.
 *
 * That button promotes the AGENT (`agx_duplicate_agent(p_as_system)`); this one
 * promotes the MANDATE (`mandate.duplicate_mandate(p_as_system)`, aidream
 * 0592). They are different objects and both are needed: an agent's system twin
 * still leaves the JOB homed in one workspace, where it decides for that
 * organization only. Promoting the mandate copies the job into the Matrx System
 * organization, which is what "impacts all users" means under D-R3 — home IS
 * scope, there is no type flag.
 *
 * 🚨 THE COPY STARTS WITH NO RUNGS. The door carries no binding across, so the
 * promoted job answers with its own default holder until somebody binds it.
 * This says so in words rather than letting an admin discover it.
 *
 * The super-admin gate here is CHROME — it decides whether to OFFER the
 * control. The authority is `is_super_admin()` inside the function body, and
 * when the door refuses anyway (a lower admin tier, or THE HOLDER LAW finding a
 * personal agent behind the job) its own sentence is printed verbatim, hint
 * included, because that hint names the door that fixes it.
 */
export function PromoteToSystemMandateButton({
  mandate,
  onPromoted,
}: {
  mandate: MandateDefinitionRow;
  /** Called after a successful promotion, before the copy is opened. */
  onPromoted?: () => void;
}) {
  const router = useRouter();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<{
    message: string;
    hint: string | null;
  } | null>(null);

  if (!isSuperAdmin) return null;

  const alreadySystem = mandate.organization_id === SYSTEM_ORGANIZATION_ID;

  return (
    <div className="mt-4 space-y-2 border-t border-border/40 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-[12px]"
          disabled={busy || alreadySystem}
          onClick={async () => {
            setBusy(true);
            setRefusal(null);
            try {
              const copy = await promoteMandateToSystem(mandate.id);
              recordToast.success(
                { type: "mandate", id: copy.id, title: copy.mandateKey },
                `Promoted to the system mandate "${copy.mandateKey}". It carries no bindings yet.`,
              );
              onPromoted?.();
              router.push(
                `/administration/mandates/${encodeURIComponent(copy.mandateKey)}`,
              );
            } catch (error: unknown) {
              // THE DOOR'S OWN WORDS, verbatim — including the hint, which
              // names the agent promotion door when the holder law fires.
              const message =
                error instanceof Error
                  ? error.message
                  : "That mandate was not promoted.";
              const hint =
                error instanceof Error && "hint" in error
                  ? ((error as { hint?: string | null }).hint ?? null)
                  : null;
              setRefusal({ message, hint });
              toast.error(message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Building2 className="h-3.5 w-3.5" />
          )}
          {busy ? "Promoting…" : "Promote to system mandate"}
        </Button>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {alreadySystem
            ? "This job is already homed in the Matrx System organization, so it already decides for every user."
            : "Copies this job into the Matrx System organization, where it decides for every user. The copy starts with no bindings, and this one is left exactly as it is."}
        </span>
      </div>
      {refusal ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-[11.5px] text-destructive">
          <p>
            <TextWithDoors text={refusal.message} />
          </p>
          {refusal.hint ? (
            <p className="mt-1 text-destructive/80">
              <TextWithDoors text={refusal.hint} />
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
