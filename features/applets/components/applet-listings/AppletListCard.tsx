"use client";

/**
 * AppletListCard
 *
 * Card view for a single applet row, used by the main /applets list and
 * its scoped variants. Receives a card model from
 * the parent's `makeSelectAppCards` selector so the same model is computed
 * once per render rather than re-resolved per card.
 *
 * Footer actions use the canonical 44px tap-target controls. Mutating action
 * handlers are lifted to the parent so it can manage busy state, route
 * transitions, and confirmation dialogs centrally.
 */

import { publishedToWebLabel } from "@/lib/row-access";
import {
  AppWindow,
  Copy,
  Globe,
  Link as LinkIcon,
  Loader2,
  Lock,
  Trash2,
} from "lucide-react";
import IconButton from "@/components/official/IconButton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AppletCardModel } from "@/features/applets/redux/applet-consumers/selectors";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { formatNumber, humanApplet } from "@/features/applets/format";
import {
  BuildTapButton,
  ExternalLinkTapButton,
  HistoryTapButton,
  PencilTapButton,
  SettingsTapButton,
} from "@ai-matrx/tap-target/buttons";

interface AppletCardProps {
  app: AppletCardModel;
  onEdit: (app: AppletCardModel) => void;
  onDuplicate: (app: AppletCardModel) => void;
  onDelete: (app: AppletCardModel) => void;
  onCopyUrl: (app: AppletCardModel) => void;
  isDuplicating?: boolean;
  isDeleting?: boolean;
  isNavigating?: boolean;
  isAnyNavigating?: boolean;
}

const STATUS_PILL_STYLES: Record<AppletCardModel["status"], string> = {
  draft: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
  published:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-300",
  archived: "bg-muted text-muted-foreground",
  suspended: "bg-destructive/15 text-destructive-ink dark:bg-destructive/25",
};

export function AppletListCard({
  app,
  onEdit,
  onDuplicate,
  onDelete,
  onCopyUrl,
  isDuplicating = false,
  isDeleting = false,
  isNavigating = false,
  isAnyNavigating = false,
}: AppletCardProps) {
  const isDisabled = isDuplicating || isDeleting || isNavigating;
  const isArchived = app.status === "archived";
  const currentUserId = useAppSelector(selectUserId);
  const isOwner = Boolean(currentUserId && app.created_by === currentUserId);
  const manageHref = `/applets/manage/${app.id}`;
  // A build still running opens at its own address, where it rejoins the live run.
  const openHref = app.build_open ? `/applets/build/${app.id}` : manageHref;
  const codeHref = `/applets/manage/${app.id}/code`;
  const versionsHref = `/applets/manage/${app.id}/versions`;
  const settingsHref = `/applets/manage/${app.id}/settings`;
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
          window.open(openHref, "_blank");
          return;
        }
        onEdit(app);
      }}
      title={isDisabled ? "Please wait..." : "Click to manage"}
    >
      {isNavigating && (
        <div
          role="status"
          aria-label={`Opening ${app.name}`}
          className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-background/80 text-sm font-medium text-foreground backdrop-blur-sm"
        >
          <Loader2 className="w-7 h-7 text-primary animate-spin" />
          Opening…
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
          {app.build_open ? "building" : app.status}
        </span>
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded text-muted-foreground"
          title={publishedToWebLabel(app.published_to_web)}
        >
          {app.published_to_web ? (
            <Globe className="h-3 w-3" />
          ) : (
            <Lock className="h-3 w-3" />
          )}
        </span>
      </div>

      <div className="group/entity-ref px-4 pt-12 pb-3 flex-1 flex flex-col gap-1">
        {/* THE DOOR LAW: the card body opens the manage page on click and
            nothing else — the NAME is the record's own anchor, so cmd-click,
            middle-click, new tab and keyboard focus work, and the peek answers
            "which Applet is that?" without leaving the list. */}
        <h3 className="text-sm font-semibold text-foreground break-words group-hover:text-primary transition-colors">
          <EntityRef
            token="app"
            id={app.id}
            name={app.name}
            showIcon={false}
            nameClassName="whitespace-normal break-words line-clamp-2"
          />
        </h3>
        {app.tagline && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {app.tagline}
          </p>
        )}
        {app.job_keys.length > 0 && (
          <div className="mt-auto pt-2 truncate text-xs text-muted-foreground" title={app.job_keys.join(", ")}>
            {app.job_keys.length === 1 ? "1 job" : `${app.job_keys.length} jobs`}
          </div>
        )}
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
        <div className="flex flex-wrap items-center justify-between">
          <ExternalLinkTapButton
            href={viewHref}
            target="_blank"
            ariaLabel={`Open public page for ${app.name}`}
            tooltip="Open public URL"
            variant="transparent"
            disabled={isDisabled}
          />
          <PencilTapButton
            href={manageHref}
            ariaLabel={`Manage ${app.name}`}
            tooltip="Manage"
            variant="transparent"
            disabled={isDisabled}
          />
          <BuildTapButton
            href={codeHref}
            ariaLabel={`Edit code for ${app.name}`}
            tooltip="Edit code"
            variant="transparent"
            disabled={isDisabled}
          />
          <HistoryTapButton
            href={versionsHref}
            ariaLabel={`View versions of ${app.name}`}
            tooltip="Versions"
            variant="transparent"
            disabled={isDisabled}
          />
          <SettingsTapButton
            href={settingsHref}
            ariaLabel={`Open settings for ${app.name}`}
            tooltip="Settings"
            variant="transparent"
            disabled={isDisabled}
          />
          <IconButton
            icon={isDuplicating ? Loader2 : Copy}
            aria-label={
              isDuplicating
                ? `Duplicating ${app.name}`
                : `Duplicate ${app.name}`
            }
            tooltip={isDuplicating ? "Duplicating…" : "Duplicate"}
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            onClick={() => onDuplicate(app)}
            disabled={isDisabled}
            spinning={isDuplicating}
          />
          <IconButton
            icon={LinkIcon}
            aria-label={`Copy public URL for ${app.name}`}
            tooltip="Copy public URL"
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            onClick={() => onCopyUrl(app)}
            disabled={isDisabled}
          />
          {isOwner && (
            <ShareButton
              resourceType="app"
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
            aria-label={
              isDeleting ? `Deleting ${app.name}` : `Delete ${app.name}`
            }
            tooltip={isDeleting ? "Deleting…" : "Delete"}
            variant="ghost"
            tooltipSide="top"
            tooltipAlign="center"
            onClick={() => onDelete(app)}
            disabled={isDisabled}
            spinning={isDeleting}
          />
          <CopyButtons
            size="icon"
            label={app.name}
            human={() => humanApplet(app)}
            json={() => app}
            agent={() => ({
              kind: "applet",
              location: "AI Matrx — Applets",
              description: "A single Applet card.",
              data: app,
              summary: humanApplet(app),
              attributes: { id: app.id, status: app.status },
            })}
          />
        </div>
      </div>
    </Card>
  );
}
