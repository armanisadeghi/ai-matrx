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
import { useState } from "react";
import { Layers, Plus } from "lucide-react";
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
  // Counts for the two headings — "it needs to say interviews and then show
  // that I have one interview" (Arman, 2026-08-21). Reported up by the two
  // lists themselves, never queried twice.
  const [interviewCount, setInterviewCount] = useState<number | null>(null);
  const [resourceCount, setResourceCount] = useState<number | null>(null);

  return (
    <section
      className="rounded-lg border border-border bg-card p-4"
      data-surface-value="sources"
    >
      {/* ── section header: the one door + the record + every-way-in ── */}
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
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {/* THE RECORD — everything the Expert has ever said, one entry
              point on the whole page. Beside the Interviews it explains:
              this is where the content of those interviews lives. */}
          <YourWordsActions
            rulebookId={rulebook.id}
            compact
            variant="outline"
          />
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-xs text-muted-foreground"
                  onClick={onOpenApproaches}
                >
                  All the ways to add
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Every way to build this Rulebook — documents, published work, AI
                chats, recordings, and more
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>

      {/* ── INTERVIEWS — a named section with its count and its own + ──
          (Arman, 2026-08-21): "it needs to say interviews and then show that
          I have one interview. And then… right where it shows interviews,
          there could be a plus icon that I can click to add more." */}
      <div className="mt-4 overflow-hidden rounded-md border border-border/70 bg-background/40">
        <div className="flex min-h-10 items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
          <h4 className="text-xs font-semibold text-foreground">Interviews</h4>
          {interviewCount !== null && interviewCount > 0 ? (
            <span className="rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
              {interviewCount}
            </span>
          ) : null}
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="ml-auto h-7 w-7"
                  onClick={onStartInterview}
                  aria-label="New interview"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                New interview — talk about how you work, rules get drafted as
                you speak
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="min-w-0">
          <ConversationsSection
            rulebookId={rulebook.id}
            rules={rulebook.rules}
            rulebookVersion={rulebook.version}
            canEdit={canEdit}
            onContinue={onContinueInterview}
            onStartNew={onStartInterview}
            onCount={setInterviewCount}
          />
        </div>
      </div>

      {/* ── RESOURCES — same shape: name, count, add. The pickers stay
          hidden until asked for (collapsedCapture): "not instantly at the
          beginning" — the panel is informational once things exist. */}
      <div className="mt-3 overflow-hidden rounded-md border border-border/70 bg-background/40">
        <div className="flex min-h-10 items-center gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
          <h4 className="text-xs font-semibold text-foreground">Resources</h4>
          {resourceCount !== null && resourceCount > 0 ? (
            <span className="rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
              {resourceCount}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 px-3 pb-3">
          <RulebookSourcesPanel
            rulebook={rulebook}
            canEdit={canEdit}
            autoOpen={dumpFocus}
            variant="bare"
            collapsedCapture
            onCount={setResourceCount}
            onRulebookChanged={onRulebookChanged}
            onIngested={onIngested}
          />
        </div>
      </div>
    </section>
  );
}
