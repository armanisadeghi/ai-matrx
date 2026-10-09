"use client";

import { AgentProofBadge } from "@/features/agents/factory/components/AgentProofBadge";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { IconButton } from "@ai-matrx/design-system";
import {
  Eye,
  Pencil,
  Play,
  Copy,
  Trash2,
  Loader2,
  Share2,
  LayoutPanelTop,
  AppWindow,
  Webhook,
  FileText,
  Archive,
  Lightbulb,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { AgentActionModal } from "./AgentActionModal";
import { AgentSneakPeekModal } from "./AgentSneakPeekModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { FavoriteAgentButton } from "@ai-matrx/agents/catalog/react";
import {
  AddToOrchestraMenu,
  AddToOrchestraSubmenu,
} from "@/features/agents/orchestras/components/AddToOrchestraMenu";
import { CreateOrchestraDialog } from "@/features/agents/orchestras/components/CreateOrchestraDialog";
import { useState } from "react";
import { toast } from "@/lib/toast-service";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  buildSystemAgentRosterEntries,
  systemAgentRosterEntrySummary,
} from "@ai-matrx/chat/agents/format";
import { useAgentModelLabel } from "@ai-matrx/chat/agents/hooks/useAgentModelLabel";
import { useAgentView } from "@ai-matrx/chat/agents/identity/agent-identity";

interface AgentCardProps {
  id: string;
  onDelete?: (id: string, name: string) => void;
  onDuplicate?: (id: string) => void;
  onNavigate?: (id: string, path: string) => void;
  isDeleting?: boolean;
  isDuplicating?: boolean;
  isNavigating?: boolean;
  isAnyNavigating?: boolean;
  /** Ordered ids for prev/next navigation within the Sneak Peek modal. */
  navigationIds?: string[];
  /** Base path for agent navigation. Defaults to `/agents`. The admin
   *  system-agents route passes `/administration/agents/system-agents/agents`. */
  basePath?: string;
}

export function AgentCard({
  id,
  onDelete,
  onDuplicate,
  onNavigate,
  isDeleting,
  isDuplicating,
  isNavigating,
  isAnyNavigating,
  navigationIds,
  basePath = "/agents",
}: AgentCardProps) {
  const dispatch = useAppDispatch();
  const record = useAgentView(id);
  // The organization a converted template is filed in — carried to the route
  // as `X-Organization-Id`, never resolved server-side into a personal one.
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const name = record?.name ?? "Untitled Agent";
  const description = record?.description ?? undefined;
  const isArchived = record?.isArchived ?? false;
  // The model it uses — with its class when the model has several and the
  // agent's settings are loaded (a list record's class is unknown).
  const { label: modelLabel } = useAgentModelLabel(id);
  const rosterEntry = record
    ? buildSystemAgentRosterEntries(
        [record],
        record.modelId && modelLabel
          ? new Map([[record.modelId, modelLabel]])
          : undefined,
      )[0]
    : null;

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isOrchestraCreateOpen, setIsOrchestraCreateOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isCreateAppModalOpen, setIsCreateAppModalOpen] = useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isSneakPeekOpen, setIsSneakPeekOpen] = useState(false);
  const [isConvertingToTemplate, setIsConvertingToTemplate] = useState(false);
  const [lastModalCloseTime, setLastModalCloseTime] = useState(0);

  const handleView = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    if (onNavigate && !isAnyNavigating) {
      onNavigate(id, `${basePath}/${id}/run`);
    }
  };

  const handleEdit = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    if (onNavigate && !isAnyNavigating) {
      onNavigate(id, `${basePath}/${id}/build`);
    }
  };

  const handleRun = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    if (onNavigate && !isAnyNavigating) {
      onNavigate(id, `${basePath}/${id}/run`);
    }
  };

  const handleDuplicate = () => {
    if (onDuplicate) {
      onDuplicate(id);
    }
  };

  // A control is absent or honest, never dead (law 4). `AgentActionModal` only
  // renders Delete when it is handed a handler, so this must be `undefined`
  // when no `onDelete` was wired — handing it an always-defined wrapper that
  // silently does nothing is the dead control we are forbidding.
  const handleDelete = onDelete
    ? () => {
        onDelete(id, name);
      }
    : undefined;

  const handleShareClick = () => {
    setIsActionModalOpen(false);
    setIsShareModalOpen(true);
  };

  const handleCreateApp = () => {
    setIsActionModalOpen(false);
    setIsCreateAppModalOpen(true);
  };

  const handleEditDetails = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsActionModalOpen(false);
    dispatch(
      openOverlay({
        overlayId: "agentAdvancedEditorWindow",
        data: {
          initialAgentId: id,
          initialTab: "overview",
          tabs: null,
        },
      }),
    );
  };

  const handleShareClickInline = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDisabled) {
      setIsShareModalOpen(true);
    }
  };

  const handleShareModalClose = () => {
    setIsShareModalOpen(false);
  };

  const handleConvertToTemplate = async () => {
    if (isConvertingToTemplate) return;
    if (!selectedOrganizationId) {
      // The route files the template in the admitted organization and refuses
      // without one — say so rather than send a request that 400s.
      toast.error(
        "Select an organization from the avatar menu, then try again.",
      );
      return;
    }
    setIsConvertingToTemplate(true);
    try {
      const response = await fetch(`/api/agents/${id}/convert-to-template`, {
        method: "POST",
        headers: applyOrganizationContextHeader({}, selectedOrganizationId),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.details
            ? `${errorData.error}: ${errorData.details}`
            : errorData.error || "Failed to save as template",
        );
      }

      const data = await response.json();
      toast.success(data.message ?? `Saved "${name}" as a template!`);
    } catch (error) {
      console.error("Error saving agent as template:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save as template. Please try again.",
      );
    } finally {
      setIsConvertingToTemplate(false);
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      window.open(`${basePath}/${id}/run`, "_blank");
      return;
    }
    const timeSinceClose = Date.now() - lastModalCloseTime;
    if (
      !isDisabled &&
      !isShareModalOpen &&
      !isActionModalOpen &&
      !isCreateAppModalOpen &&
      !isMetadataModalOpen &&
      !isSneakPeekOpen &&
      timeSinceClose > 300
    ) {
      setIsActionModalOpen(true);
    }
  };

  const isDisabled = isNavigating || isAnyNavigating || isConvertingToTemplate;

  return (
    <Card
      className={cn(
        "@container flex flex-col h-full bg-card border border-border transition-all duration-200 overflow-hidden relative",
        isDisabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:shadow-lg hover:shadow-primary/10 hover:border-primary/30 cursor-pointer hover:scale-[1.02] group",
        isArchived && !isDisabled && "opacity-70",
      )}
      onClick={handleCardClick}
      title={
        isDisabled
          ? isNavigating
            ? "Navigating..."
            : "Please wait..."
          : "Click to choose action"
      }
    >
      {isNavigating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <span className="type-title text-foreground">
              Loading...
            </span>
          </div>
        </div>
      )}

      <div className="absolute top-3 left-3 z-10">
        <div
          className={`w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-sm transition-all duration-200 ${
            !isDisabled &&
            "group-hover:bg-primary/90 group-hover:shadow-md group-hover:scale-105"
          }`}
        >
          <Webhook
            className={`w-4 h-4 text-primary-foreground transition-transform duration-200 ${
              !isDisabled && "group-hover:scale-110"
            }`}
          />
        </div>
      </div>

      <FavoriteAgentButton id={id} disabled={isDisabled} />
      {isArchived && (
        <div className="absolute top-3 right-8 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
          <Archive className="h-3 w-3" />
          <span className="type-meta font-medium">Archived</span>
        </div>
      )}

      <div className="group/entity-ref relative p-4 pb-7 pl-12 pr-8 flex-1 flex flex-col items-center justify-center gap-1.5">
        {/* The proof badge has its own strip under the name (bottom padding above is its
            room), so it can never sit on the action bar or the name, whatever the card's
            width — and, absolute inside reserved padding, it arrives without moving anything. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center">
          <AgentProofBadge agentId={id} />
        </div>
        {/* THE DOOR LAW: the card body opens a chooser modal, so the NAME
            carries the record's own door — a real anchor, which is what makes
            cmd-click, middle-click, "open in new tab" and keyboard focus work.
            `nameClassName` keeps the tile's wrapped, centred title. */}
        <h3
          title={name}
          className={`min-w-0 max-w-full text-md font-medium text-foreground text-center transition-colors duration-200 ${
            !isDisabled && "group-hover:text-primary"
          }`}
        >
          <EntityRef
            token="agent"
            id={id}
            name={name}
            href={`${basePath}/${id}`}
            showIcon={false}
            nameClassName="whitespace-normal [overflow-wrap:anywhere] line-clamp-3"
          />
        </h3>
      </div>
      <div className="border-t border-border p-1 bg-card rounded-b-lg min-h-[36px]">
        <div
          className="flex items-center justify-between gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-1 items-center min-w-0">
            <Link
              href={`${basePath}/${id}/run`}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleRun(e);
              }}
            >
              <IconButton
                icon={Play}
                tooltip={isDisabled ? "Please wait..." : "Run"}
                variant="ghost"
                tooltipSide="top"
                tooltipAlign="center"
                disabled={isDisabled}
              />
            </Link>
            <Link
              href={`${basePath}/${id}/build`}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleEdit(e);
              }}
            >
              <IconButton
                icon={Pencil}
                tooltip={isDisabled ? "Please wait..." : "Edit"}
                variant="ghost"
                tooltipSide="top"
                tooltipAlign="center"
                disabled={isDisabled}
              />
            </Link>
            <div className="hidden @[340px]:contents">
            <Link
              href={`${basePath}/${id}/run`}
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleView(e);
              }}
            >
              <IconButton
                icon={Eye}
                tooltip={isDisabled ? "Please wait..." : "View"}
                variant="ghost"
                tooltipSide="top"
                tooltipAlign="center"
                disabled={isDisabled}
              />
            </Link>
            </div>
            <div className="hidden @[340px]:contents">
            <IconButton
              icon={Lightbulb}
              tooltip={isDisabled ? "Please wait..." : "Sneak Peek"}
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              onClick={(e) => {
                e.stopPropagation();
                if (!isDisabled) setIsSneakPeekOpen(true);
              }}
              disabled={isDisabled}
            />
            <IconButton
              icon={Share2}
              tooltip="Share"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              onClick={handleShareClickInline}
              disabled={isDisabled}
            />
            <AddToOrchestraMenu agentId={id} disabled={isDisabled} />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <IconButton
                  icon={MoreHorizontal}
                  tooltip={isDisabled ? "Please wait..." : "More actions"}
                  variant="ghost"
                  tooltipSide="top"
                  tooltipAlign="center"
                  disabled={isDisabled}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  className="gap-2 @[340px]:hidden"
                  onSelect={() => handleView()}
                >
                  <Eye className="h-4 w-4" />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 @[340px]:hidden"
                  onSelect={() => setIsSneakPeekOpen(true)}
                >
                  <Lightbulb className="h-4 w-4" />
                  Sneak Peek
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 @[340px]:hidden"
                  onSelect={() => setIsShareModalOpen(true)}
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </DropdownMenuItem>
                <AddToOrchestraSubmenu
                  agentId={id}
                  className="@[340px]:hidden"
                  onCreate={() => setIsOrchestraCreateOpen(true)}
                />
                <DropdownMenuItem
                  className="gap-2"
                  disabled={isDuplicating}
                  onSelect={handleDuplicate}
                >
                  {isDuplicating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {isDuplicating ? "Duplicating..." : "Duplicate"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  onSelect={() => handleEditDetails()}
                >
                  <FileText className="h-4 w-4" />
                  Edit Details
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2" onSelect={handleCreateApp}>
                  <AppWindow className="h-4 w-4" />
                  Create App
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2"
                  disabled={isConvertingToTemplate}
                  onSelect={() => handleConvertToTemplate()}
                >
                  {isConvertingToTemplate ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LayoutPanelTop className="h-4 w-4" />
                  )}
                  {isConvertingToTemplate ? "Saving template..." : "Save as Template"}
                </DropdownMenuItem>
                {handleDelete && (
                  <DropdownMenuItem
                    className="gap-2 text-destructive @[340px]:hidden"
                    disabled={isDeleting}
                    onSelect={handleDelete}
                  >
                    <Trash2 className="h-4 w-4" />
                    {isDeleting ? "Deleting..." : "Delete"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {record && rosterEntry && (
              <CopyButtons
                size="icon"
                label={name}
                human={() => systemAgentRosterEntrySummary(rosterEntry)}
                json={() => rosterEntry}
                agent={() => ({
                  kind:
                    record.agentType === "builtin" ? "system-agent" : "agent",
                  location:
                    record.agentType === "builtin"
                      ? `AI Matrx Admin — System Agents · Roster (${basePath})`
                      : `AI Matrx — Agents (${basePath})`,
                  description: "A single agent roster entry.",
                  data: record,
                  attributes: { id: record.id, agentType: record.agentType },
                })}
              />
            )}
            {/* Absent, never dead: a host that wires no `onDelete` gets no
                Delete button at all rather than one that swallows the click. */}
            {handleDelete && (
              <div className="hidden @[340px]:contents">
              <IconButton
                icon={isDeleting ? Loader2 : Trash2}
                tooltip={
                  isDeleting
                    ? "Deleting..."
                    : isDisabled
                      ? "Please wait..."
                      : "Delete"
                }
                variant="ghost"
                tooltipSide="top"
                tooltipAlign="center"
                onClick={handleDelete}
                disabled={isDeleting || isDisabled}
                spinning={isDeleting}
              />
              </div>
            )}
          </div>
        </div>
      </div>

      <AgentActionModal
        isOpen={isActionModalOpen}
        onClose={() => {
          setIsActionModalOpen(false);
          setLastModalCloseTime(Date.now());
        }}
        agentName={name}
        agentDescription={description}
        onRun={handleRun}
        onEdit={handleEdit}
        onView={handleView}
        onDuplicate={handleDuplicate}
        onShare={handleShareClick}
        onDelete={handleDelete}
        onCreateApp={handleCreateApp}
        isDeleting={isDeleting}
        isDuplicating={isDuplicating}
      />

      {isOrchestraCreateOpen ? (
        <CreateOrchestraDialog
          open={isOrchestraCreateOpen}
          onOpenChange={setIsOrchestraCreateOpen}
          seedMemberId={id}
        />
      ) : null}

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleShareModalClose}
        resourceType="agent"
        resourceId={id}
        resourceName={name}
      />

      <ComingSoonModal
        isOpen={isCreateAppModalOpen}
        onClose={() => {
          setIsCreateAppModalOpen(false);
          setLastModalCloseTime(Date.now());
        }}
        featureName="Create App from Agent"
      />

      <ComingSoonModal
        isOpen={isMetadataModalOpen}
        onClose={() => {
          setIsMetadataModalOpen(false);
          setLastModalCloseTime(Date.now());
        }}
        featureName="Edit Agent Details"
      />

      <AgentSneakPeekModal
        agentId={id}
        isOpen={isSneakPeekOpen}
        onClose={() => {
          setIsSneakPeekOpen(false);
          setLastModalCloseTime(Date.now());
        }}
        navigationIds={navigationIds}
      />
    </Card>
  );
}
