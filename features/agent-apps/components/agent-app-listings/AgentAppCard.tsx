"use client";

/**
 * AgentAppCard
 *
 * Card view for a single agent-app row, used by the main /agent-apps list and
 * its scoped variants. Receives a pre-joined card model (apps × agents) from
 * the parent's `makeSelectAppCards` selector so the same model is computed
 * once per render rather than re-resolved per card.
 *
 * Hover actions: View (public URL), Edit (manage page), Duplicate, Delete,
 * Copy URL. The action handlers are lifted to the parent so it can manage
 * busy state, route transitions, and confirmation dialogs centrally.
 */

import Link from "next/link";
import {
  AppWindow,
  Code,
  Copy,
  ExternalLink,
  Globe,
  History,
  Link as LinkIcon,
  Loader2,
  Lock,
  Pencil,
  Settings as SettingsIcon,
  Trash2,
} from "lucide-react";
import IconButton from "@/components/official/IconButton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AgentAppCardModel } from "@/features/agent-apps/redux/agent-app-consumers/selectors";
import { ShareButton } from "@/features/sharing";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

interface AgentAppCardProps {
  app: AgentAppCardModel;
  onView: (app: AgentAppCardModel) => void;
  onEdit: (app: AgentAppCardModel) => void;
  onDuplicate: (app: AgentAppCardModel) => void;
  onDelete: (app: AgentAppCardModel) => void;
  onCopyUrl: (app: AgentAppCardModel) => void;
  isDuplicating?: boolean;
  isDeleting?: boolean;
  isNavigating?: boolean;
  isAnyNavigating?: boolean;
}

const STATUS_PILL_STYLES: Record<AgentAppCardModel["status"], string> = {
  draft: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
  published:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/15 text-destructive dark:bg-destructive/25",
};

function formatNumber(n: number | null | undefined): string {
  if (!n || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}m`;
}

export function AgentAppCard({
  app,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onCopyUrl,
  isDuplicating = false,
  isDeleting = false,
  isNavigating = false,
  isAnyNavigating = false,
}: AgentAppCardProps) {
  const isDisabled = isDuplicating || isDeleting || isNavigating;
  const isArchived = app.status === "archived";
  const currentUserId = useAppSelector(selectUserId);
  const isOwner = Boolean(currentUserId && app.user_id === currentUserId);
  const manageHref = `/agent-apps/${app.id}`;
  const codeHref = `/agent-apps/${app.id}/code`;
  const versionsHref = `/agent-apps/${app.id}/versions`;
  const settingsHref = `/agent-apps/${app.id}/settings`;
  const viewHref = `/p/${app.slug}`;

  return (
    <Card
      className={cn(
        "flex flex-col h-full bg-card border border-border transition-all duration-200 overflow-hidden relative",
        isDisabled
          ? "opacity-60"
          : "hover:shadow-lg hover:shadow-primary/10 hover:border-primary/30 hover:scale-[1.01] group cursor-pointer",
        isArchived && !isDisabled && "opacity-70",
      )}
      onClick={(e) => {
        if (isDisabled || isAnyNavigating) return;
        if (e.metaKey || e.ctrlKey) {
          window.open(manageHref, "_blank");
          return;
        }
        onEdit(app);
      }}
      title={isDisabled ? "Please wait..." : "Click to manage"}
    >
      {isNavigating && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-20 flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
        </div>
      )}

      <div className="absolute top-2.5 left-2.5 z-10">
        <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-sm">
          <AppWindow className="w-4 h-4 text-primary-foreground" />
        </div>
      </div>

      <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
            STATUS_PILL_STYLES[app.status],
          )}
        >
          {app.status}
        </span>
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground"
          title={app.is_public ? "Public" : "Private"}
        >
          {app.is_public ? (
            <Globe className="h-3 w-3" />
          ) : (
            <Lock className="h-3 w-3" />
          )}
        </span>
      </div>

      <div className="px-4 pt-12 pb-3 flex-1 flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground line-clamp-2 break-words group-hover:text-primary transition-colors">
          {app.name || "Untitled App"}
        </h3>
        {app.tagline && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {app.tagline}
          </p>
        )}
        <div className="mt-auto pt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="truncate"
            title={`Agent: ${app.agent_name ?? app.agent_id}`}
          >
            <span className="opacity-70">Agent:</span>{" "}
            <span className="text-foreground font-medium">
              {app.agent_name ?? "—"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span title="Total executions">
            {formatNumber(app.total_executions)} runs
          </span>
          {app.success_rate != null && (
            <span title="Success rate">
              {Math.round(app.success_rate * 100)}% success
            </span>
          )}
          {app.category && (
            <span className="truncate" title={`Category: ${app.category}`}>
              · {app.category}
            </span>
          )}
        </div>
      </div>

      <div
        className="border-t border-border py-1 px-3 bg-card rounded-b-lg min-h-[34px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-1 justify-between items-center">
          <Link
            href={viewHref}
            target="_blank"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              icon={ExternalLink}
              tooltip="Open public URL"
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              disabled={isDisabled}
              onClick={() => onView(app)}
            />
          </Link>
          <Link
            href={manageHref}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              if (e.metaKey || e.ctrlKey) return;
              onEdit(app);
            }}
          >
            <IconButton
              icon={Pencil}
              tooltip="Manage"
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              disabled={isDisabled}
            />
          </Link>
          <Link
            href={codeHref}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              icon={Code}
              tooltip="Edit code"
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              disabled={isDisabled}
            />
          </Link>
          <Link
            href={versionsHref}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              icon={History}
              tooltip="Versions"
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              disabled={isDisabled}
            />
          </Link>
          <Link
            href={settingsHref}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
          >
            <IconButton
              icon={SettingsIcon}
              tooltip="Settings"
              size="sm"
              variant="ghost"
              tooltipSide="top"
              tooltipAlign="center"
              disabled={isDisabled}
            />
          </Link>
          <IconButton
            icon={isDuplicating ? Loader2 : Copy}
            tooltip={isDuplicating ? "Duplicating…" : "Duplicate"}
            size="sm"
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            onClick={() => onDuplicate(app)}
            disabled={isDisabled}
            iconClassName={isDuplicating ? "animate-spin" : ""}
          />
          <IconButton
            icon={LinkIcon}
            tooltip="Copy public URL"
            size="sm"
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            onClick={() => onCopyUrl(app)}
            disabled={isDisabled}
          />
          {isOwner && (
            <ShareButton
              resourceType="agent_app"
              resourceId={app.id}
              resourceName={app.name}
              isOwner={true}
              variant="ghost"
              size="icon"
              showStatus={false}
            />
          )}
          <IconButton
            icon={isDeleting ? Loader2 : Trash2}
            tooltip={isDeleting ? "Deleting…" : "Delete"}
            size="sm"
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            onClick={() => onDelete(app)}
            disabled={isDisabled}
            iconClassName={isDeleting ? "animate-spin" : ""}
          />
        </div>
      </div>
    </Card>
  );
}
