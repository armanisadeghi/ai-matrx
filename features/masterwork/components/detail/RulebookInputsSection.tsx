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
//   header  — Your words (the record) · Add (THE Approach picker — every way
//             in, read from the platform.approach registry) · New interview
//             (the primary way in, kept as its own one-click button)
//   body    — the interview list (ConversationsSection) then the attached
//             sources + capture + "Turn this into rules"
//             (RulebookSourcesPanel, variant="bare")
//
// This file adds no capability. It is pure consolidation: every control here
// already existed somewhere else on the page and was deleted from there.
//
// 2026-08-20 — the `Add ▾` menu was a HARDCODED three-item list ("A document",
// "Published work", "AI chats") standing exactly where the Approach picker
// belongs, naming three of the registry's lanes and hiding the rest. It is
// deleted; `Add` now opens `ApproachPickerDialog`, which renders every row of
// `platform.approach`. Per Arman's own rule, adding an affordance obliges you
// to delete the one it replaces.

import Link from "next/link";
import { Layers, MessageSquarePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  /** Open THE Approach picker — every registered way to feed this Rulebook. */
  onOpenApproaches: () => void;
}

export function RulebookInputsSection({
  rulebook,
  canEdit,
  dumpFocus,
  onRulebookChanged,
  onIngested,
  onContinueInterview,
  onStartInterview,
  onOpenApproaches,
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={onOpenApproaches}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Every way to add to this Rulebook — documents, published work,
                AI chats, recordings, and more
              </TooltipContent>
            </Tooltip>
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
