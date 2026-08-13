"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Loader2,
  MoreVertical,
  Play,
  Pencil,
  Eye,
  Copy,
  Trash2,
  Share2,
  AppWindow,
  Settings,
  LayoutPanelTop,
  Globe,
  FileText,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RootState } from "@/lib/redux/store";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { AgentActionModal } from "./AgentActionModal";
import { AgentSneakPeekModal } from "./AgentSneakPeekModal";
import { ComingSoonModal } from "./ComingSoonModal";
import { FavoriteAgentButton } from "./FavoriteAgentButton";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";

interface AgentListItemProps {
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
  /** Base path for agent navigation. Defaults to `/agents`. */
  basePath?: string;
}

export function AgentListItem({
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
}: AgentListItemProps) {
  const dispatch = useAppDispatch();
  const record = useAppSelector((state) => selectAgentById(state, id));
  const name = record?.name ?? "Untitled Agent";
  const isArchived = record?.isArchived ?? false;

  const isSystemAdmin = useAppSelector((state: RootState) =>
    selectIsSuperAdmin(state),
  );
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isCreateAppModalOpen, setIsCreateAppModalOpen] = useState(false);
  const [isConvertToBuiltinModalOpen, setIsConvertToBuiltinModalOpen] =
    useState(false);
  const [isMetadataModalOpen, setIsMetadataModalOpen] = useState(false);
  const [isSneakPeekOpen, setIsSneakPeekOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAdminMenuOpen, setIsAdminMenuOpen] = useState(false);
  const [isConvertingToTemplate, setIsConvertingToTemplate] = useState(false);
  const [lastModalCloseTime, setLastModalCloseTime] = useState(0);

  const handleItemClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      window.open(`${basePath}/${id}/run`, "_blank");
      return;
    }
    const timeSinceClose = Date.now() - lastModalCloseTime;
    if (!isDisabled && !isActionModalOpen && timeSinceClose > 300) {
      setIsActionModalOpen(true);
    }
  };

  const handleActionModalClose = () => {
    setIsActionModalOpen(false);
    setLastModalCloseTime(Date.now());
  };

  const handleShareClick = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsMenuOpen(false);
    setIsShareModalOpen(true);
  };

  const handleCreateApp = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsMenuOpen(false);
    setIsCreateAppModalOpen(true);
  };

  const handleEditDetails = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsMenuOpen(false);
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

  const handleSneakPeek = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsMenuOpen(false);
    setIsSneakPeekOpen(true);
  };

  const handleRun = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.stopPropagation();
    if (onNavigate && !isDisabled) {
      onNavigate(id, `${basePath}/${id}/run`);
    }
  };

  const handleEdit = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.stopPropagation();
    if (onNavigate && !isDisabled) {
      onNavigate(id, `${basePath}/${id}/build`);
    }
  };

  const handleView = (e?: React.MouseEvent) => {
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.stopPropagation();
    if (onNavigate && !isDisabled) {
      onNavigate(id, `${basePath}/${id}/run`);
    }
  };

  const handleDuplicate = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (onDuplicate) {
      onDuplicate(id);
    }
  };

  const handleDelete = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (onDelete) {
      onDelete(id, name);
    }
  };

  const handleConvertToTemplate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSystemAdmin || isConvertingToTemplate) return;
    setIsConvertingToTemplate(true);
    setIsMenuOpen(false);
    try {
      void announceComingSoon("agents.save-as-template");
    } finally {
      setIsConvertingToTemplate(false);
    }
  };

  const handleMakeGlobalBuiltin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isSystemAdmin) return;
    setIsMenuOpen(false);
    setIsAdminMenuOpen(false);
    setIsConvertToBuiltinModalOpen(true);
  };

  const isDisabled = isNavigating || isAnyNavigating || isConvertingToTemplate;

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2 border border-border rounded-lg",
          "transition-all relative bg-card",
          !isDisabled &&
            "hover:bg-accent/50 hover:border-primary/30 cursor-pointer hover:shadow-sm",
          isDisabled && "opacity-50 cursor-not-allowed",
          isArchived && !isDisabled && "opacity-70",
        )}
        onClick={(e) => handleItemClick(e)}
        title={
          isDisabled
            ? isNavigating
              ? "Navigating..."
              : "Please wait..."
            : "Click to choose action"
        }
      >
        {isNavigating && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          </div>
        )}

        <FavoriteAgentButton id={id} variant="list" disabled={isDisabled} />

        <div className="group/entity-ref flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* THE DOOR LAW: the row itself opens a chooser modal, so the name
                is the record's own door — a real anchor (cmd-click, middle
                click, new tab, keyboard). */}
            <h4 className="text-sm font-medium text-foreground truncate">
              <EntityRef
                token="agent"
                id={id}
                name={name}
                href={`${basePath}/${id}`}
                showIcon={false}
              />
            </h4>
            {isArchived && (
              <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                Archived
              </span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                disabled={isDisabled}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <Link
                href={`${basePath}/${id}/run`}
                tabIndex={-1}
                onClick={(e) => handleRun(e)}
              >
                <DropdownMenuItem disabled={isDisabled}>
                  <Play className="mr-2 h-4 w-4" />
                  Run
                </DropdownMenuItem>
              </Link>
              <Link
                href={`${basePath}/${id}/build`}
                tabIndex={-1}
                onClick={(e) => handleEdit(e)}
              >
                <DropdownMenuItem disabled={isDisabled}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              </Link>
              <Link
                href={`${basePath}/${id}/run`}
                tabIndex={-1}
                onClick={(e) => handleView(e)}
              >
                <DropdownMenuItem disabled={isDisabled}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </DropdownMenuItem>
              </Link>
              <DropdownMenuItem onClick={handleSneakPeek} disabled={isDisabled}>
                <Flame className="mr-2 h-4 w-4" />
                Sneak Peek
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleDuplicate}
                disabled={isDuplicating || isDisabled}
              >
                {isDuplicating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="mr-2 h-4 w-4" />
                )}
                {isDuplicating ? "Duplicating..." : "Duplicate"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleShareClick}
                disabled={isDisabled}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCreateApp} disabled={isDisabled}>
                <AppWindow className="mr-2 h-4 w-4" />
                Create App
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleEditDetails}
                disabled={isDisabled}
              >
                <FileText className="mr-2 h-4 w-4" />
                Edit Details
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleDelete}
                disabled={isDeleting || isDisabled}
                className="text-destructive focus:text-destructive"
              >
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {isDeleting ? "Deleting..." : "Delete"}
              </DropdownMenuItem>

              {isSystemAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenu
                    open={isAdminMenuOpen}
                    onOpenChange={setIsAdminMenuOpen}
                  >
                    <DropdownMenuTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Settings className="mr-2 h-4 w-4" />
                        Admin Actions
                      </DropdownMenuItem>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="left"
                      align="start"
                      className="w-48"
                    >
                      <DropdownMenuItem
                        onClick={handleConvertToTemplate}
                        disabled={isConvertingToTemplate}
                      >
                        {isConvertingToTemplate ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <LayoutPanelTop className="mr-2 h-4 w-4" />
                        )}
                        {isConvertingToTemplate
                          ? "Converting..."
                          : "Convert to Template"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleMakeGlobalBuiltin}>
                        <Globe className="mr-2 h-4 w-4" />
                        Make Global Built-in
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AgentActionModal
        isOpen={isActionModalOpen}
        onClose={handleActionModalClose}
        agentId={id}
        agentName={name}
        onRun={handleRun}
        onEdit={() => handleEdit()}
        onView={handleView}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        onShare={handleShareClick}
        onCreateApp={handleCreateApp}
        isDuplicating={isDuplicating}
        isDeleting={isDeleting}
      />

      {isShareModalOpen && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          resourceType="agent"
          resourceId={id}
          resourceName={name}
        />
      )}
      {isCreateAppModalOpen && (
        <ComingSoonModal
          isOpen={isCreateAppModalOpen}
          onClose={() => setIsCreateAppModalOpen(false)}
          featureName="Create App from Agent"
        />
      )}
      {isConvertToBuiltinModalOpen && (
        <ComingSoonModal
          isOpen={isConvertToBuiltinModalOpen}
          onClose={() => setIsConvertToBuiltinModalOpen(false)}
          featureName="Convert to Agent Builtin"
        />
      )}
      {isMetadataModalOpen && (
        <ComingSoonModal
          isOpen={isMetadataModalOpen}
          onClose={() => {
            setIsMetadataModalOpen(false);
            setLastModalCloseTime(Date.now());
          }}
          featureName="Edit Agent Details"
        />
      )}
      <AgentSneakPeekModal
        agentId={id}
        isOpen={isSneakPeekOpen}
        onClose={() => {
          setIsSneakPeekOpen(false);
          setLastModalCloseTime(Date.now());
        }}
        navigationIds={navigationIds}
      />
    </>
  );
}
