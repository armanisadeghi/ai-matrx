"use client";

// features/masterwork/components/detail/RulebookInputsSection.tsx
//
// ONE SECTION FOR EVERY INPUT.
//
// Arman, 2026-08-18, looking at the Rulebook page after five lanes had each
// added their own card: "Shouldn't there be one section for expertise source
// or something, and therefore the conversations I have, the documents I
// upload, all of those are the same thing. They're all the inputs." And:
// "all of the things I'm putting in to get a result should be together, not
// put all across the fucking code."
//
// Before this file, the ways to feed a Rulebook were in THREE places: a
// Conversations card at the top, a collapsed Sources row in the middle, and
// three more buttons ("From a source", "Your published work", "Your AI chats")
// welded onto the rules toolbar at the bottom. Now every one of them lives
// here, and NOWHERE else on the page:
//
//   header  — Your words (the record) · Add ▾ (document · published work · AI
//             chats) · New interview (the primary way in)
//   body    — the interview list (ConversationsSection) then the attached
//             sources + capture + "Turn this into rules"
//             (RulebookSourcesPanel, variant="bare")
//
// This file adds no capability. It is pure consolidation: every control here
// already existed somewhere else on the page and was deleted from there.

import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  FileUp,
  Layers,
  MessagesSquare,
  MessageSquarePlus,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ConversationsSection } from "../../record/ConversationsSection";
import { YourWordsActions } from "../../record/YourWordsActions";
import { RulebookSourcesPanel } from "./RulebookSourcesPanel";
import type { Rulebook } from "../../types";

export interface RulebookInputsSectionProps {
  rulebook: Rulebook;
  canEdit: boolean;
  /** `?dump=1` — the dump Approach card routes here; scroll + focus. */
  dumpFocus: boolean;
  onRulebookChanged: (rulebook: Rulebook) => void;
  onIngested: () => void;
  /** Resume an existing interview in the panel beside the rules. */
  onContinueInterview: (conversationId: string) => void;
  /** Start a brand-new interview in the panel. */
  onStartInterview: () => void;
  onAddDocument: () => void;
  onAddPublishedWork: () => void;
  onAddChats: () => void;
}

export function RulebookInputsSection({
  rulebook,
  canEdit,
  dumpFocus,
  onRulebookChanged,
  onIngested,
  onContinueInterview,
  onStartInterview,
  onAddDocument,
  onAddPublishedWork,
  onAddChats,
}: RulebookInputsSectionProps) {
  return (
    <section
      className="rounded-lg border border-border bg-card px-4 py-3"
      data-surface-value="sources"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
          {/* THE DOOR LAW — the heading itself opens this working mode's page. */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href={`/masterwork/${rulebook.id}/sources`}
                className="text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Sources
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              Everything your rules come from — open it as its own page
            </TooltipContent>
          </Tooltip>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Interviews, documents, published work, AI chats
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {/* THE RECORD — everything the Expert has ever said, one entry
              point on the whole page (it used to be here, in the header, and
              in a bare unlabeled icon beside it). */}
          <YourWordsActions rulebookId={rulebook.id} compact variant="ghost" />
          {canEdit ? (
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7">
                      <Plus className="h-3.5 w-3.5" />
                      Add
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  Bring in something you already have — we read it and draft
                  rules from it
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Turn what you already have into rules
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => onAddDocument()}>
                  <FileUp className="h-4 w-4" />
                  A document or recording
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddPublishedWork()}>
                  <BookOpen className="h-4 w-4" />
                  Your published work
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onAddChats()}>
                  <MessagesSquare className="h-4 w-4" />
                  Your AI chats
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" className="h-7" onClick={onStartInterview}>
                  <MessageSquarePlus className="h-3.5 w-3.5" />
                  New interview
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Talk about how you work — rules get drafted as you speak
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      <div className="mt-2">
        <ConversationsSection
          rulebookId={rulebook.id}
          rules={rulebook.rules}
          rulebookVersion={rulebook.version}
          canEdit={canEdit}
          onContinue={onContinueInterview}
          onStartNew={onStartInterview}
        />
      </div>

      <div className="mt-2 border-t border-border/60 pt-2">
        <RulebookSourcesPanel
          rulebook={rulebook}
          canEdit={canEdit}
          autoOpen={dumpFocus}
          variant="bare"
          onRulebookChanged={onRulebookChanged}
          onIngested={onIngested}
        />
      </div>
    </section>
  );
}
