"use client";

// features/agents/browse/components/AgentBrowseCards.tsx
//
// The card view, taking the best of both originals:
//   from /agents/all — the clean card shape, the icon avatar, the favorite star
//     in the corner, the archived pill, card-click → AgentActionModal;
//   from /transcripts — a small number of NAMED primary actions instead of a
//     row of 10 unlabeled icons nobody can decode.
//
// The 10-icon row is gone on purpose. Icons that need a tooltip to be legible
// are not an action bar, they are a quiz — and two of those icons went to the
// same route while a third opened "Coming Soon". Cards now carry the three
// actions a user actually reaches for, and the SAME complete "…" menu the
// table row has. Nothing is lost; everything is findable in one place.

import Link from "next/link";
import {
  Play,
  Pencil,
  Eye,
  Star,
  Archive,
  MoreHorizontal,
  Webhook,
} from "lucide-react";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  shouldOpenInNewTab,
  openInNewTab,
} from "@/utils/navigation/should-open-in-new-tab";
import { cleanMarkdownPreview } from "@/utils/markdown-processors/clean-markdown-to-text";
import type { AgentBrowseRow } from "../types";

interface Props {
  rows: AgentBrowseRow[];
  density: "compact" | "comfortable";
  showOwner: boolean;
  menuFor: (row: AgentBrowseRow) => () => ItemMenuConfig;
  onOpenActionModal: (row: AgentBrowseRow) => void;
  onToggleFavorite: (row: AgentBrowseRow) => void;
  /** THE DOOR LAW — the agent's canonical route, from the list shell. */
  hrefFor: (row: AgentBrowseRow) => string | undefined;
}

function CardAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Play;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      onClick={(e) => e.stopPropagation()}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

export function AgentBrowseCards({
  rows,
  density,
  showOwner,
  menuFor,
  onOpenActionModal,
  onToggleFavorite,
  hrefFor,
}: Props) {
  return (
    <div
      className={cn(
        "grid gap-3",
        density === "compact"
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      )}
    >
      {rows.map((row) => {
        const agentHref = hrefFor(row);
        return (
        <div
          key={row.id}
          role="button"
          tabIndex={0}
          title="Click to choose action"
          onClick={(e) => {
            // Cmd/ctrl-click → Run in a new tab (classic card behaviour).
            if (shouldOpenInNewTab(e)) {
              openInNewTab(`/agents/${row.id}/run`);
              return;
            }
            onOpenActionModal(row);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpenActionModal(row);
            }
          }}
          className="group flex cursor-pointer flex-col rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
        >
          <div className="flex items-start gap-2.5 p-3 pb-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Webhook className="h-4 w-4" />
            </span>

            <div className="min-w-0 flex-1">
              {/*
                The name is a REAL anchor so cmd-click, middle-click, "open in
                new tab" and keyboard focus reach the agent — the card body
                still opens AgentActionModal, so the click that bubbles is
                unchanged and only the name itself navigates.
              */}
              <p className="line-clamp-2 text-sm font-medium leading-snug">
                {agentHref ? (
                  <Link
                    href={agentHref}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.name}
                  </Link>
                ) : (
                  row.name
                )}
              </p>
              {row.description && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {cleanMarkdownPreview(row.description)}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {row.category && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] py-0 font-normal"
                  >
                    {row.category}
                  </Badge>
                )}
                {row.is_archived && (
                  <Badge variant="outline" className="text-[10px] py-0">
                    <Archive className="mr-1 h-2.5 w-2.5" />
                    Archived
                  </Badge>
                )}
                {showOwner && row.owner_email && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {row.owner_email}
                  </span>
                )}
              </div>
            </div>

            <div
              className="flex shrink-0 items-center gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label={
                  row.is_favorite ? "Remove from favorites" : "Add to favorites"
                }
                title={
                  row.is_owner ? undefined : "Shared agents can't be favorited"
                }
                disabled={!row.is_owner}
                onClick={() => onToggleFavorite(row)}
                className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <Star
                  className={cn(
                    "h-3.5 w-3.5",
                    row.is_favorite && "fill-amber-400 text-amber-500",
                  )}
                />
              </button>
              <ItemMenu config={menuFor(row)} align="end">
                <button
                  type="button"
                  aria-label={`Actions for ${row.name}`}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </ItemMenu>
            </div>
          </div>

          <div className="mt-auto flex items-center gap-1 border-t border-border px-2 py-1">
            <CardAction
              href={`/agents/${row.id}/run`}
              icon={Play}
              label="Run"
            />
            <CardAction
              href={`/agents/${row.id}/build`}
              icon={Pencil}
              label="Edit"
            />
            <CardAction href={`/agents/${row.id}`} icon={Eye} label="View" />
          </div>
        </div>
        );
      })}
    </div>
  );
}
