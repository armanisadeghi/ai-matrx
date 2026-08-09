"use client";

import { useEffect, useState } from "react";
import { FileText, Layers, Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { FileResourceChip } from "@/features/files/components/preview/FileResourceChip";
import { ResourceAttachmentTile } from "@/features/agents/components/messages-display/user/ResourceAttachmentTile";
import {
  hasPeek,
  peekKeyForToken,
} from "@/features/organizations/peek/kinds-list";
import { ResourcePeekHost } from "@/features/organizations/peek/ResourcePeekHost";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import type { ResourcePickerViewId } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import {
  resolveEntityToken,
  tryGetEntityInfo,
} from "@/features/scopes/registry/entityRegistry";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type { AssociationTargetEdge } from "@/features/scopes/types";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

const AGENT_RESOURCE_ROLE = "agent_resource";

/**
 * The canonical resource picker offers run-only and URL-only resources too.
 * Permanent Agent Resources intentionally expose only selections with a stable,
 * registered entity id that the agent-resource RPC can permission-check.
 */
const AGENT_RESOURCE_PICKER_VIEWS = [
  "files",
  "notes",
  "workbooks",
  "documents",
] as const satisfies readonly Exclude<ResourcePickerViewId, null>[];

interface AgentResourcesManagerProps {
  agentId: string;
}

interface AgentResourceSelection {
  sourceType: EntityTypeToken;
  sourceId: string;
  label: string;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Convert the canonical resource-picker payload into a durable entity edge. */
export function agentResourceFromPickerSelection(
  selection: unknown,
): AgentResourceSelection | null {
  if (!selection || typeof selection !== "object") return null;
  const picked = selection as Record<string, unknown>;
  const type = nonEmptyString(picked.type);
  const data =
    picked.data && typeof picked.data === "object"
      ? (picked.data as Record<string, unknown>)
      : null;
  if (!type || !data) return null;

  if (type === "file") {
    const sourceId = nonEmptyString(data.fileId) ?? nonEmptyString(data.id);
    if (!sourceId) return null;
    const details =
      data.details && typeof data.details === "object"
        ? (data.details as Record<string, unknown>)
        : null;
    return {
      sourceType: "file",
      sourceId,
      label:
        nonEmptyString(details?.filename) ??
        nonEmptyString(data.filename) ??
        "File",
    };
  }

  const sourceId = nonEmptyString(data.id);
  if (!sourceId) return null;
  if (type === "note") {
    return {
      sourceType: "note",
      sourceId,
      label: nonEmptyString(data.label) ?? "Note",
    };
  }
  if (type === "workbook") {
    return {
      sourceType: "workbook",
      sourceId,
      label: nonEmptyString(data.name) ?? "Workbook",
    };
  }
  if (type === "document") {
    return {
      sourceType: "udt_document",
      sourceId,
      label: nonEmptyString(data.title) ?? "Document",
    };
  }
  return null;
}

function AgentResourcePickerAction({
  batch,
  onSelected,
}: {
  batch: boolean;
  onSelected: (selection: unknown) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const Icon = batch ? Layers : Plus;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={
            batch
              ? "Add several permanent resources"
              : "Add a permanent resource"
          }
        >
          <Icon className="h-3.5 w-3.5" />
          {batch ? "Batch add" : "Add"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[200] w-80 border-border p-0"
        align="end"
        side="bottom"
        sideOffset={6}
      >
        <ResourcePickerMenu
          allowedViewIds={AGENT_RESOURCE_PICKER_VIEWS}
          onResourceSelected={(selection) => {
            void onSelected(selection).then((attached) => {
              if (attached && !batch) setOpen(false);
            });
          }}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function AgentResourcesManager({ agentId }: AgentResourcesManagerProps) {
  const [edges, setEdges] = useState<AssociationTargetEdge[]>([]);
  const [loading, setLoading] = useState(true);
  /** The attached resource the user is previewing, if any. */
  const [peekFor, setPeekFor] = useState<AssociationTargetEdge | null>(null);

  const reload = async () => {
    const result = await associationsService.listForTargetsVisible("agent", [
      agentId,
    ]);
    if (isScopesRpcErr(result)) {
      toast.error(`Couldn't load resources: ${result.error.message}`);
      return;
    }
    const next = result.data.edges.filter(
      (edge) => edge.role === AGENT_RESOURCE_ROLE,
    );
    setEdges(next);
    // A peek open on an edge the reload dropped would keep previewing a
    // resource this agent no longer has.
    setPeekFor((current) =>
      current && next.some((edge) => edge.id === current.id) ? current : null,
    );
  };

  useEffect(() => {
    let active = true;
    void associationsService
      .listForTargetsVisible("agent", [agentId])
      .then((result) => {
        if (!active) return;
        setLoading(false);
        if (isScopesRpcErr(result)) {
          toast.error(`Couldn't load resources: ${result.error.message}`);
          return;
        }
        setEdges(
          result.data.edges.filter((edge) => edge.role === AGENT_RESOURCE_ROLE),
        );
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  const attach = async (pickerSelection: unknown): Promise<boolean> => {
    const selection = agentResourceFromPickerSelection(pickerSelection);
    if (!selection) {
      toast.error("That resource cannot be permanently attached yet");
      return false;
    }
    const result = await associationsService.addAgentResource({
      agentId,
      ...selection,
    });
    if (isScopesRpcErr(result)) {
      toast.error(`Couldn't attach resource: ${result.error.message}`);
      return false;
    }
    await reload();
    return true;
  };

  const detach = async (edge: AssociationTargetEdge) => {
    const result = await associationsService.removeAgentResource({
      agentId,
      sourceType: edge.sourceType,
      sourceId: edge.sourceId,
    });
    if (isScopesRpcErr(result)) {
      toast.error(`Couldn't remove resource: ${result.error.message}`);
      return;
    }
    setEdges((current) => current.filter((item) => item.id !== edge.id));
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Label className="shrink-0 text-xs text-muted-foreground">
        Resources
      </Label>

      <ScrollFade
        orientation="horizontal"
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-1.5 py-0.5"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
        {edges.map((edge) => {
          if (edge.sourceType === "file") {
            return (
              <FileResourceChip
                key={edge.id}
                fileId={edge.sourceId}
                nameOverride={edge.label ?? undefined}
                onRemove={() => void detach(edge)}
                size="xs"
                className="shrink-0"
              />
            );
          }

          // ONE canonicalisation feeds both doors. Resolving the entity
          // through `tryGetEntityInfo` (which canonicalises) while looking the
          // peek up by the RAW string is the "one door and not the other"
          // split this helper was extracted to prevent — reintroduced in the
          // commit that extracted it, and caught in review.
          const canonicalToken = resolveEntityToken(edge.sourceType);
          const entity = tryGetEntityInfo(canonicalToken);
          const canPeek = hasPeek(peekKeyForToken(canonicalToken));
          return (
            <ResourceAttachmentTile
              key={edge.id}
              typeLabel={entity?.label ?? "Resource"}
              title={edge.label ?? entity?.label ?? "Resource"}
              icon={entity?.Icon ?? FileText}
              themeKey={edge.sourceType}
              // THE DOOR LAW. Every OTHER `ResourceAttachmentTile` consumer
              // wires `onClick` (chat messages open the block; the composer
              // chips open the resource); this strip was the one that resolved
              // the entity, drew the icon, and then let the tile sit inert —
              // so an agent's permanently-attached resources were the only
              // ones you could not look at.
              //
              // PEEK, not navigate: the builder holds unsaved agent config, so
              // following a route here would cost the user their edits. A peek
              // answers "which note is that?" without leaving, and carries its
              // own Open door (`peekHref`, registry-resolved) for the user who
              // does want to go. Gated on a peek actually existing — an
              // openable-looking tile that no-ops is the dead end this
              // campaign exists to kill.
              onClick={canPeek ? () => setPeekFor(edge) : undefined}
              onRemove={() => void detach(edge)}
              variant="compact"
            />
          );
        })}
      </ScrollFade>

      <div className="flex shrink-0 items-center gap-1">
        <AgentResourcePickerAction batch={false} onSelected={attach} />
        <AgentResourcePickerAction batch onSelected={attach} />
      </div>

      {peekFor && (
        <ResourcePeekHost
          kind={peekKeyForToken(resolveEntityToken(peekFor.sourceType))}
          id={peekFor.sourceId}
          onClose={() => setPeekFor(null)}
        />
      )}
    </div>
  );
}
