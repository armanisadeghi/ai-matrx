"use client";

// THE one duplicate flow for agents. Every "Duplicate" — the agent header menu,
// a list row, a card, the quick look, the read-only builder, a version row, a
// version page — calls `openDuplicate(...)` and renders `dialog`. The dialog
// asks which version (default: current, or the version the caller names) and
// the copy's name, then runs the one copy (`duplicateAgent` → agent.duplicate_*).

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { supabase } from "@/utils/supabase/client";
import { duplicateAgent } from "@/features/agents/redux/builder-write.thunks";
import {
  AgentDuplicateDialog,
  CURRENT_VERSION_CHOICE,
  type AgentDuplicateStep,
  type DuplicateVersionOption,
} from "@/features/agents/components/shared/AgentDuplicateDialog";
import {
  ADMIN_SYSTEM_AGENTS_BASE_PATH,
  isAdminSystemAgentsContext,
} from "@ai-matrx/chat/agents/components/shared/agent-route-context";
import { getUserMessage } from "@ai-matrx/agents/matrx";

interface UseAgentDuplicateFlowOptions {
  /** The route family the copy opens in. Default: the admin system-agents base on those routes, else "/agents". */
  basePath?: string;
  /** Sub-route the copy opens on when the source is not the current page. */
  fallbackSuffix?: string;
  /** Called once a copy exists (a list refreshes; a toast-only surface closes a peek). */
  onDuplicated?: (newAgentId: string) => void;
  /** Called when the dialog closes; `madeCopy` says whether a copy was made. */
  onDialogClosed?: (madeCopy: boolean) => void;
}

export interface OpenDuplicateTarget {
  agentId: string;
  /** Preselect this saved version (definition_version id); omitted = current. */
  versionId?: string;
  /**
   * Make the copy a system agent. Omitted = a builtin copied from the admin
   * system-agents routes stays a builtin; everywhere else it is a personal copy.
   */
  asSystem?: boolean;
}

interface SourceAgent {
  name: string;
  version: number | null;
  agentType: string | null;
}

function defaultCopyName(sourceName: string, versionNumber: number | null): string {
  return versionNumber == null ? `${sourceName} (Copy)` : `${sourceName} (v${versionNumber} copy)`;
}

export function useAgentDuplicateFlow(options?: UseAgentDuplicateFlowOptions) {
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const basePath =
    options?.basePath ??
    (pathname?.startsWith(ADMIN_SYSTEM_AGENTS_BASE_PATH) ? ADMIN_SYSTEM_AGENTS_BASE_PATH : "/agents");
  const fallbackSuffix = options?.fallbackSuffix ?? "/build";
  const isAdminContext = isAdminSystemAgentsContext(basePath);

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<AgentDuplicateStep>("choose");
  const [target, setTarget] = useState<OpenDuplicateTarget | null>(null);
  const [source, setSource] = useState<SourceAgent | null>(null);
  const [versions, setVersions] = useState<DuplicateVersionOption[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(CURRENT_VERSION_CHOICE);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [newAgent, setNewAgent] = useState<{ id: string; name: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  // Only the latest open's reads may land (a quick reopen never shows the older agent).
  const loadSeq = useRef(0);

  const asSystem =
    target?.asSystem ?? (isAdminContext && source?.agentType === "builtin");

  const versionNumberOf = (choice: string, list: DuplicateVersionOption[]) =>
    choice === CURRENT_VERSION_CHOICE
      ? null
      : (list.find((v) => v.versionId === choice)?.versionNumber ?? null);

  const selectVersion = (choice: string) => {
    setSelected(choice);
    // The suggested name follows the version until the person types their own.
    if (!nameEdited && source) {
      setName(defaultCopyName(source.name, versionNumberOf(choice, versions)));
    }
  };

  async function openDuplicate(next: OpenDuplicateTarget) {
    const seq = ++loadSeq.current;
    setTarget(next);
    setStep("choose");
    setNewAgent(null);
    setErrorMessage("");
    setNameEdited(false);
    setSelected(CURRENT_VERSION_CHOICE);
    setSource(null);
    setName("");
    setVersions([]);
    setVersionsError(null);
    setVersionsLoading(true);
    setOpen(true);

    let agentRes, historyRes;
    try {
      [agentRes, historyRes] = await Promise.all([
      supabase
        .schema("agent")
        .from("definition")
        .select("name, version, agent_type")
        .eq("id", next.agentId)
        .single(),
      supabase.rpc("agx_get_version_history", {
        p_agent_id: next.agentId,
        p_limit: 500,
        p_offset: 0,
      }),
    ]);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setVersionsLoading(false);
      setErrorMessage(getUserMessage(err));
      setStep("error");
      return;
    }
    if (seq !== loadSeq.current) return;
    setVersionsLoading(false);

    if (agentRes.error) {
      setErrorMessage(getUserMessage(agentRes.error));
      setStep("error");
      return;
    }
    const src: SourceAgent = {
      name: agentRes.data.name,
      version: agentRes.data.version ?? null,
      agentType: agentRes.data.agent_type ?? null,
    };
    const list: DuplicateVersionOption[] = historyRes.error
      ? []
      : (historyRes.data ?? []).map((row) => ({
          versionId: row.version_id,
          versionNumber: row.version_number,
          changedAt: row.changed_at,
          changeNote: row.change_note ?? null,
        }));
    if (historyRes.error) setVersionsError(historyRes.error.message);

    // A named version that IS the current one copies the live agent.
    const named = next.versionId ? list.find((v) => v.versionId === next.versionId) : undefined;
    const choice =
      named && named.versionNumber !== src.version ? named.versionId : CURRENT_VERSION_CHOICE;

    setSource(src);
    setVersions(list);
    setSelected(choice);
    setName(defaultCopyName(src.name, choice === CURRENT_VERSION_CHOICE ? null : (named?.versionNumber ?? null)));
  }

  async function confirm() {
    if (!target) return;
    setStep("loading");
    try {
      const id = await dispatch(
        duplicateAgent({
          agentId: target.agentId,
          versionId: selected === CURRENT_VERSION_CHOICE ? undefined : selected,
          asSystem,
          name,
        }),
      ).unwrap();
      // The database settles the final name (a taken name gets " (2)"); the
      // copy is already in the store (the thunk loaded it), read it from there.
      const finalName = (await supabase.schema("agent").from("definition").select("name").eq("id", id).single()).data?.name;
      setNewAgent({ id, name: finalName ?? "the new agent" });
      setStep("success");
      options?.onDuplicated?.(id);
    } catch (err) {
      // Closing the organization picker is "not now", never a failure.
      setErrorMessage(getUserMessage(err));
      setStep("error");
    }
  }

  const newAgentPath =
    newAgent && target
      ? (() => {
          const sourceSegment = `${basePath}/${target.agentId}`;
          const here =
            pathname && pathname.startsWith(sourceSegment)
              ? pathname.slice(sourceSegment.length)
              : fallbackSuffix;
          // A copy starts at v1: a page about versions (/v/3, /latest) has
          // nothing to show on it, so it opens on its default page instead.
          const suffix = /^\/(v|latest)(\/|$)/.test(here) ? fallbackSuffix : here;
          return `${basePath}/${newAgent.id}${suffix || fallbackSuffix}`;
        })()
      : null;

  const dialog = (
    <AgentDuplicateDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) options?.onDialogClosed?.(step === "success");
      }}
      step={step}
      sourceName={source?.name ?? null}
      currentVersion={source?.version ?? null}
      versions={versions}
      versionsLoading={versionsLoading}
      versionsError={versionsError}
      selected={selected}
      onSelectedChange={selectVersion}
      name={name}
      onNameChange={(value) => {
        setName(value);
        setNameEdited(true);
      }}
      onConfirm={() => void confirm()}
      newAgentName={newAgent?.name ?? ""}
      newAgentPath={newAgentPath}
      errorMessage={errorMessage}
      asSystem={asSystem}
    />
  );

  return {
    openDuplicate,
    dialog,
    isDuplicating: open && step === "loading",
    /** The agent being copied right now (a list marks only that row busy). */
    duplicatingAgentId: open && step === "loading" ? (target?.agentId ?? null) : null,
  } as const;
}
