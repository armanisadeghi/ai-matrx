"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import IconButton from "@/components/official/IconButton";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { AgentActionModal } from "./AgentActionModal";
import { AgentSneakPeekModal } from "./AgentSneakPeekModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { FavoriteAgentButton } from "./FavoriteAgentButton";
import { useState } from "react";
import { toast } from "@/lib/toast-service";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

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
   *  system-agents route passes `/administration/system-agents/agents`. */
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
  const record = useAppSelector((state) => selectAgentById(state, id));
  const name = record?.name ?? "Untitled Agent";
  const description = record?.description ?? undefined;
  const isArchived = record?.isArchived ?? false;
  const isOwner = record?.isOwner ?? true;

  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
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

  const handleDelete = () => {
    if (onDelete) {
      onDelete(id, name);
    }
  };

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
    setIsConvertingToTemplate(true);
    try {
      const response = await fetch(`/api/agents/${id}/convert-to-template`, {
        method: "POST",
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
        "flex flex-col h-full bg-card border border-border transition-all duration-200 overflow-hidden relative",
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
            <span className="text-sm font-medium text-foreground">
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
          <span className="text-[10px] font-medium">Archived</span>
        </div>
      )}

      <div className="p-4 pl-12 pr-8 flex-1 flex flex-col items-center justify-center gap-1.5">
        <h3
          className={`text-md font-medium text-foreground text-center line-clamp-3 break-words transition-colors duration-200 ${
            !isDisabled && "group-hover:text-primary"
          }`}
        >
          {name || "Untitled Agent"}
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
                size="sm"
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
                size="sm"
                variant="ghost"
                tooltipSide="top"
                tooltipAlign="center"
                disabled={isDisabled}
              />
            </Link>
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
                size="sm"
                variant="ghost"
                tooltipSide="top"
                tooltipAlign="center"
                disabled={isDisabled}
              />
            </Link>
            <IconButton
              icon={Lightbulb}
              tooltip={isDisabled ? "Please wait..." : "Sneak Peek"}
              size="sm"
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
              icon={isDuplicating ? Loader2 : Copy}
              tooltip={
                isDuplicating
                  ? "Duplicating..."
                  : isDisabled
                    ? "Please wait..."
                    : "Duplicate"
              }
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              onClick={handleDuplicate}
              disabled={isDuplicating || isDisabled}
              iconClassName={isDuplicating ? "animate-spin" : ""}
            />
            <IconButton
              icon={Share2}
              tooltip="Share"
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              onClick={handleShareClickInline}
              disabled={isDisabled}
            />
            <IconButton
              icon={FileText}
              tooltip={isDisabled ? "Please wait..." : "Edit Details"}
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              onClick={handleEditDetails}
              disabled={isDisabled}
            />
            <IconButton
              icon={AppWindow}
              tooltip={isDisabled ? "Please wait..." : "Create App"}
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              onClick={handleCreateApp}
              disabled={isDisabled}
            />
            <IconButton
              icon={isConvertingToTemplate ? Loader2 : LayoutPanelTop}
              tooltip={
                isConvertingToTemplate
                  ? "Saving template..."
                  : isDisabled
                    ? "Please wait..."
                    : "Save as Template"
              }
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              onClick={(e) => {
                e.stopPropagation();
                handleConvertToTemplate();
              }}
              disabled={isConvertingToTemplate || isDisabled}
              iconClassName={isConvertingToTemplate ? "animate-spin" : ""}
            />
          </div>
          <IconButton
            icon={isDeleting ? Loader2 : Trash2}
            tooltip={
              isDeleting
                ? "Deleting..."
                : isDisabled
                  ? "Please wait..."
                  : "Delete"
            }
            size="sm"
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            onClick={handleDelete}
            disabled={isDeleting || isDisabled}
            iconClassName={isDeleting ? "animate-spin" : ""}
          />
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

      <ShareModal
        isOpen={isShareModalOpen}
        onClose={handleShareModalClose}
        resourceType="agent"
        resourceId={id}
        resourceName={name}
        isOwner={isOwner}
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
