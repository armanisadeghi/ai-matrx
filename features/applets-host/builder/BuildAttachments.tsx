"use client";

// features/applets-host/builder/BuildAttachments.tsx — the builder's "+" (lane A1).
//
// The SAME attach sources as /chat's "+" (`ResourcePickerMenu`: files, notes, documents, pages, tables…) plus
// her own Agents and Workflows (the ONE agent picker, `@ai-matrx/agents/catalog/react`, and the workflow
// picker), and the chips of what is attached. It only PICKS: the builder keeps the list on the build's record
// and sends it every round (`build-references.ts`); an agent or workflow becomes the Applet's job here
// (`applet-job.ts`). Nothing about the attach path is re-implemented.

import { useState, useSyncExternalStore } from "react";
import { FileText, Paperclip, Plus, Workflow, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Button } from "@ai-matrx/design-system/controls";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import type { Resource } from "@ai-matrx/chat/agents/resources/types";

import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { WorkflowListDropdown } from "@/features/workflow-runtime/listings/WorkflowListDropdown";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { jobForHolder } from "./applet-job";
import { jobReference, resourceReference, type BuildReference } from "./build-references";

/** The attach sources a build takes: material she can point at. Chats, tools and skills belong to a chat. */
export const BUILD_ATTACH_VIEWS = ["files", "notes", "documents", "workbooks", "tables", "tasks", "webpage", "youtube", "image_url", "file_url"] as const;

// False on the server and the first client render, true once React has attached: a press before then reaches
// no handler, so the "+" says it is getting ready instead of silently doing nothing.
const noopSubscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

async function holderNaming(holder: "agent" | "workflow", id: string): Promise<{ name: string; description: string | null }> {
  const { data, error } = await createClient().schema(holder).from("definition").select("name, description").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return { name: data?.name ?? (holder === "agent" ? "Agent" : "Workflow"), description: data?.description ?? null };
}

export function BuildAttachments({
  references,
  organizationId,
  disabled = false,
  onAdd,
  onRemove,
}: {
  references: readonly BuildReference[];
  /** The organization the Applet is (or will be) built in — an attached agent becomes a job there. */
  organizationId: string | null;
  disabled?: boolean;
  onAdd: (reference: BuildReference) => void | Promise<void>;
  onRemove: (id: string) => void | Promise<void>;
}) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);
  const [making, setMaking] = useState<string | null>(null);
  const hydrated = useHydrated();

  const addResource = async (resource: Resource) => {
    await onAdd(resourceReference(resource));
    return true;
  };

  const addHolder = async (holder: "agent" | "workflow", holderId: string) => {
    setOpen(false);
    if (!organizationId) {
      toast.error("Choose the organization you are working in first.");
      return;
    }
    setMaking(holder);
    try {
      const naming = await holderNaming(holder, holderId);
      const job = await jobForHolder(dispatch, { organizationId, holder, holderId, name: naming.name, description: naming.description });
      await onAdd(jobReference({ holder, holderId, label: naming.name, jobKey: job.jobKey }));
    } catch (err) {
      // The server's own sentence (who may make a job here, or why this agent cannot run in it).
      const why = err instanceof Error ? err.message : String(err);
      console.error("[applet-build] could not make a job for the attached", holder, { holderId, err });
      toast.error(why);
    } finally {
      setMaking(null);
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-applet-attachments="">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="quiet"
            icon={making || !hydrated ? <Spinner /> : <Plus />}
            disabled={disabled || making !== null || !hydrated}
            aria-busy={!hydrated || undefined}
            aria-label="Attach files, agents or workflows"
            title={hydrated ? "Attach files, agents or workflows" : "Getting ready"}
            data-applet-attach=""
          />
        </PopoverTrigger>
        <PopoverContent
          /* sizing: fixed — the attach menu's drill-in pickers each own their scroll; same shell as /chat's + */
          align="start"
          side="bottom"
          sideOffset={6}
          className="flex h-[min(70dvh,560px)] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-border p-1">
            <AgentListDropdown
              consumerId="applet-build-attach-agent"
              onSelect={(id) => void addHolder("agent", id)}
              excludeAgentIds={references.flatMap((r) => (r.kind === "job" && r.holder === "agent" ? [r.holder_id] : []))}
              triggerSlot={
                <Button variant="quiet" icon={<AGENT_ICON />} data-applet-attach-agent="">
                  Agent
                </Button>
              }
            />
            <WorkflowListDropdown
              onSelect={(id) => void addHolder("workflow", id)}
              excludeWorkflowIds={references.flatMap((r) => (r.kind === "job" && r.holder === "workflow" ? [r.holder_id] : []))}
              triggerSlot={
                <Button variant="quiet" icon={<Workflow />} data-applet-attach-workflow="">
                  Workflow
                </Button>
              }
            />
          </div>
          <div className="min-h-0 flex-1">
            <ResourcePickerMenu
              fillHost
              allowedViewIds={BUILD_ATTACH_VIEWS}
              onResourceSelected={addResource}
              onClose={() => setOpen(false)}
            />
          </div>
        </PopoverContent>
      </Popover>
      {references.map((r) => (
        <span
          key={r.id}
          className="inline-flex h-6 min-w-0 max-w-[16rem] items-center gap-1 rounded-md border border-border bg-card pl-2 text-xs"
          title={r.kind === "job" ? `${r.label} runs in this Applet` : r.label}
          data-applet-reference={r.kind}
        >
          {r.kind === "job" ? (
            r.holder === "agent" ? <AGENT_ICON className="h-3.5 w-3.5 shrink-0" /> : <Workflow className="h-3.5 w-3.5 shrink-0" />
          ) : r.resource.type === "file" || r.resource.type === "document" ? (
            <FileText className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">{r.label}</span>
          <Button variant="quiet" icon={<X />} aria-label={`Remove ${r.label}`} title="Remove" disabled={disabled} onClick={() => void onRemove(r.id)} />
        </span>
      ))}
    </div>
  );
}
