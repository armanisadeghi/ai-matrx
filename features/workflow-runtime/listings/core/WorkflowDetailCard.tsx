"use client";

// The workflow twin of `AgentDetailCard`: everything known about the hovered
// record, and every door out of it — Select, Peek, Run it, Open in a new tab.
// Nothing is hidden behind "click through to find out".

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  Clock,
  ExternalLink,
  Folder,
  Globe,
  ListOrdered,
  Play,
  Rocket,
  Star,
  Tag,
  Users,
  CircleCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { setWorkflowFlag } from "../../browse/service";
import { RunStatusChip } from "../../run-status";
import { workflowHref, type WorkflowListRecord } from "../types";
import {
  WorkflowSneakPeekContent,
  WorkflowSneakPeekCopyMenu,
} from "./WorkflowSneakPeek";

export interface WorkflowDetailCardProps {
  workflow: WorkflowListRecord;
  onSelect: () => void;
  /** Re-read the list after a write this card made. */
  onChanged?: () => void;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * The favorite toggle. Only the OWNER's row carries the column, so a record
 * you can merely see says why the control is absent instead of offering a
 * star that silently fails.
 */
function FavoriteWorkflowButton({
  workflow,
  onChanged,
}: {
  workflow: WorkflowListRecord;
  onChanged?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [isFavorite, setIsFavorite] = useState(workflow.isFavorite);

  if (workflow.isOwner === false) {
    return (
      <span
        className="text-[10px] text-muted-foreground"
        title="Only the owner of a workflow can favorite it"
      >
        Shared with you
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      title={isFavorite ? "Remove from favorites" : "Add to favorites"}
      onClick={async () => {
        const next = !isFavorite;
        setPending(true);
        setIsFavorite(next);
        try {
          await setWorkflowFlag(workflow.id, { is_favorite: next });
          onChanged?.();
        } catch (err: unknown) {
          setIsFavorite(!next);
          toast.error(
            `Favorite could not be saved: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        } finally {
          setPending(false);
        }
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-amber-500 disabled:opacity-50"
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          isFavorite && "fill-amber-500 text-amber-500",
        )}
      />
    </button>
  );
}

export function WorkflowDetailCard({
  workflow,
  onSelect,
  onChanged,
}: WorkflowDetailCardProps) {
  const [peekOpen, setPeekOpen] = useState(false);
  const updated = formatDate(workflow.updatedAt);
  const created = formatDate(workflow.createdAt);
  const lastRun = formatDate(workflow.lastRunAt);
  const href = workflowHref(workflow.id);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold leading-tight text-foreground">
              {workflow.name}
            </h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {workflow.version !== null && (
                <span className="text-[11px] text-muted-foreground">
                  v{workflow.version}
                </span>
              )}
              {workflow.isArchived && (
                <Badge variant="outline" className="py-0 text-[10px]">
                  Archived
                </Badge>
              )}
              {!workflow.isActive && (
                <Badge variant="outline" className="py-0 text-[10px]">
                  Inactive
                </Badge>
              )}
            </div>
          </div>
          <FavoriteWorkflowButton workflow={workflow} onChanged={onChanged} />
        </div>
      </div>

      <div className="mx-3 h-px bg-border" />

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {workflow.description && (
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Description
            </p>
            <p className="text-xs leading-relaxed text-foreground/80">
              {workflow.description}
            </p>
          </div>
        )}

        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Delivers
          </p>
          <code className="text-xs text-foreground/80">
            {workflow.outputKind ?? "undeclared"}
          </code>
        </div>

        {workflow.category && (
          <div className="flex items-center gap-2">
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs text-foreground/80">
              {workflow.category}
            </span>
          </div>
        )}

        {workflow.tags.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[11px] font-medium text-muted-foreground">
                Tags
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {workflow.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex h-5 items-center rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {(workflow.stepCount !== null || workflow.runCount !== null) && (
          <div className="flex items-center gap-4">
            {workflow.stepCount !== null && (
              <span className="flex items-center gap-1.5 text-xs text-foreground/80">
                <ListOrdered className="h-3.5 w-3.5 text-muted-foreground" />
                {workflow.stepCount} step{workflow.stepCount === 1 ? "" : "s"}
              </span>
            )}
            {workflow.runCount !== null && (
              <span className="flex items-center gap-1.5 text-xs text-foreground/80">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                {workflow.runCount} run{workflow.runCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        )}

        {workflow.lastRunStatus && (
          <div className="flex items-center gap-2">
            <RunStatusChip status={workflow.lastRunStatus} />
            {lastRun && (
              <span className="text-[11px] text-muted-foreground">
                {lastRun}
              </span>
            )}
          </div>
        )}

        {(workflow.accessLevel || workflow.visibility) && (
          <div className="flex items-center gap-2">
            {workflow.isOwner === false ? (
              <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <div className="flex flex-col">
              <span className="text-xs capitalize text-foreground/80">
                {workflow.isOwner
                  ? "You own this"
                  : workflow.accessLevel
                    ? `Shared — ${workflow.accessLevel}`
                    : (workflow.visibility ?? "")}
              </span>
              {workflow.ownerEmail && (
                <span className="text-[10px] text-muted-foreground">
                  by {workflow.ownerEmail}
                </span>
              )}
              {workflow.organizationName && (
                <span className="text-[10px] text-muted-foreground">
                  {workflow.organizationName}
                </span>
              )}
            </div>
          </div>
        )}

        {(updated || created) && (
          <div className="space-y-1 pt-1">
            {updated && (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">
                  Updated {updated}
                </span>
              </div>
            )}
            {created && (
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <span className="text-[11px] text-muted-foreground/70">
                  Created {created}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mx-3 mt-auto h-px bg-border" />
      <div className="flex shrink-0 items-center gap-1.5 px-3 py-2">
        <button
          onClick={onSelect}
          className="h-7 flex-1 rounded-md bg-primary text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80"
        >
          Select
        </button>
        <HoverCard
          open={peekOpen}
          onOpenChange={setPeekOpen}
          openDelay={200}
          closeDelay={120}
        >
          <HoverCardTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              title="Sneak Peek — hover to look inside"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary"
            >
              <Rocket className="h-3.5 w-3.5" />
            </button>
          </HoverCardTrigger>
          <HoverCardContent
            side="right"
            align="end"
            sideOffset={12}
            avoidCollisions
            collisionPadding={8}
            className="flex max-h-[var(--radix-hover-card-content-available-height)] w-[420px] flex-col gap-3 border border-border bg-card p-4"
          >
            <div className="shrink-0 pr-2 text-sm font-semibold text-foreground">
              {workflow.name}
            </div>
            <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
              <WorkflowSneakPeekContent
                workflowId={workflow.id}
                active={peekOpen}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 border-t border-border pt-3">
              <WorkflowSneakPeekCopyMenu workflowId={workflow.id} />
              <Button
                size="sm"
                className="ml-auto"
                onClick={(e) => {
                  e.stopPropagation();
                  setPeekOpen(false);
                  onSelect();
                }}
              >
                <CircleCheck />
                Select Workflow
              </Button>
            </div>
          </HoverCardContent>
        </HoverCard>
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          title="Open this workflow to run it"
          aria-label="Open this workflow to run it"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary"
        >
          <Play className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Open in new tab"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
