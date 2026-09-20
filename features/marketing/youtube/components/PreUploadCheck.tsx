"use client";

/**
 * THE PUBLISH-NOTHING PRE-UPLOAD CHECK (PLAN §4.11 Plane A).
 *
 * Paste or type a title, a description and tags against the keyword you want
 * the video to rank for; see a scored checklist and your thumbnail rendered at
 * the size the mobile feed shows it; then copy the block into YouTube Studio.
 *
 * 🚨 IT PUBLISHES NOTHING, AND THAT IS STRUCTURAL, NOT A PROMISE. There is no
 * writer in this component and none in the module it scores with
 * (`preupload.ts` is pure). Our YouTube grants are read-only
 * (`youtube.readonly`, `yt-analytics.readonly`), so an upload could not happen
 * even if someone wired one — and the surface says so rather than leaving a
 * person to wonder what pressing a button here does.
 *
 * Champions: TubeBuddy's SEO checklist and vidIQ's scorecard. Where we beat
 * them: neither renders the thumbnail at feed size, so both grade "a custom
 * thumbnail exists" and leave the only question that matters — can anyone read
 * it on a phone — unanswered.
 */

import { useState } from "react";
import { ClipboardCopy, Eye } from "lucide-react";

import { Input, Textarea } from "@ai-matrx/design-system";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ClipboardFallbackDialog } from "@/components/dialogs/clipboard-fallback/ClipboardFallbackDialog";
import { toast } from "@/lib/toast";
import {
  ScoredChecklist,
  type ScoredChecklistRow,
} from "@/features/marketing/components/shared/ScoredChecklist";
import { ThumbnailAtMobileSize } from "@/features/marketing/components/shared/ThumbnailAtMobileSize";

import { useTargetKeywordRequired } from "../knobs";
import {
  scorePreUpload,
  studioClipboardText,
  type PreUploadDraft,
} from "../preupload";

/** Tags as a person types them: comma or newline separated. */
export function splitTags(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

const EMPTY_DRAFT = {
  title: "",
  description: "",
  tagsRaw: "",
  targetKeyword: "",
  thumbnailUrl: "",
  thumbnailText: "",
};

export interface PreUploadCheckProps {
  /** Rendered as a plain section inside the channel panel; no chrome of its own. */
  className?: string;
}

export function PreUploadCheck({ className }: PreUploadCheckProps) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [clipboardFallback, setClipboardFallback] = useState<string | null>(null);
  const knob = useTargetKeywordRequired();

  const scoredDraft: PreUploadDraft = {
    title: draft.title,
    description: draft.description,
    tags: splitTags(draft.tagsRaw),
    targetKeyword: draft.targetKeyword,
    thumbnailUrl: draft.thumbnailUrl.trim() || null,
    thumbnailText: draft.thumbnailText,
  };
  const verdict = scorePreUpload(scoredDraft, {
    targetKeywordRequired: knob.required,
  });
  const rows: ScoredChecklistRow[] = verdict.checks.map((check) => ({
    id: check.id,
    label: check.label,
    state: check.state,
    detail: check.detail,
  }));

  const nothingTyped =
    !draft.title.trim() && !draft.description.trim() && !draft.tagsRaw.trim();

  async function copyForStudio(): Promise<void> {
    const text = studioClipboardText(scoredDraft);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied — paste it into YouTube Studio.");
    } catch {
      setClipboardFallback(text);
    }
  }

  return (
    <section className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          Check a video before you upload it
        </h3>
        <p className="text-[11px] leading-4 text-muted-foreground">
          Nothing here is sent to YouTube — our permission is read-only. You copy
          the result and paste it into YouTube Studio yourself.
        </p>
      </div>

      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="yt-keyword" className="text-xs">
              Keyword you want this video to rank for
              {knob.required ? (
                <span className="ml-1 text-destructive" aria-hidden>
                  *
                </span>
              ) : null}
            </Label>
            <Input
              id="yt-keyword"
              value={draft.targetKeyword}
              onChange={(event) =>
                setDraft({ ...draft, targetKeyword: event.target.value })
              }
              placeholder="commercial roof inspection"
              className="text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="yt-title" className="text-xs">
              Title
            </Label>
            <Input
              id="yt-title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              placeholder="What the video is, in the words someone searches"
              className="text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="yt-description" className="text-xs">
              Description
            </Label>
            <Textarea
              id="yt-description"
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
              rows={5}
              placeholder="The first 150 characters are all most people ever read."
              className="text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="yt-tags" className="text-xs">
              Tags (comma separated)
            </Label>
            <Input
              id="yt-tags"
              value={draft.tagsRaw}
              onChange={(event) => setDraft({ ...draft, tagsRaw: event.target.value })}
              placeholder="roof inspection, commercial roofing, flat roof"
              className="text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="yt-thumbnail" className="text-xs">
              Thumbnail image URL
            </Label>
            <Input
              id="yt-thumbnail"
              value={draft.thumbnailUrl}
              onChange={(event) =>
                setDraft({ ...draft, thumbnailUrl: event.target.value })
              }
              placeholder="https://…"
              className="text-base sm:text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="yt-thumbnail-text" className="text-xs">
              Words on the thumbnail
            </Label>
            <Input
              id="yt-thumbnail-text"
              value={draft.thumbnailText}
              onChange={(event) =>
                setDraft({ ...draft, thumbnailText: event.target.value })
              }
              placeholder="ROOF LEAK?"
              className="text-base sm:text-sm"
            />
            <p className="text-[10px] leading-3 text-muted-foreground">
              We cannot read your image. Telling us the words lets us say whether
              there are too many to read at feed size.
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-start gap-3">
            <ThumbnailAtMobileSize
              src={draft.thumbnailUrl.trim() || null}
              alt={
                draft.thumbnailText.trim()
                  ? `Your thumbnail, which you said reads "${draft.thumbnailText.trim()}"`
                  : "Your thumbnail at the size the YouTube mobile feed shows it"
              }
              caption="Actual size in the YouTube mobile feed. If you cannot read it here, nobody can read it there."
            />
            <div className="min-w-0 flex-1">
              {/* 🚨 THE KNOB'S DEFAULT ANNOUNCES ITSELF (law 4). While the ladder
                  is being asked, the screen says which posture it is acting on
                  rather than flickering between two different rule sets. */}
              {knob.isResolving ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  Checking whether your organization requires a target keyword —
                  using the platform default (required) until it answers.
                </p>
              ) : null}
              {nothingTyped ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
                  <Eye className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  Type or paste a title, description and tags on the left. The
                  checks below grade them as you go and nothing is saved anywhere.
                </p>
              ) : null}
            </div>
          </div>

          <ScoredChecklist
            rows={rows}
            score={verdict.state === "scored" ? verdict.score : null}
            measured={verdict.state === "scored" ? verdict.measured : undefined}
            total={verdict.state === "scored" ? verdict.total : undefined}
            refusal={verdict.state === "needs_keyword" ? verdict.sentence : null}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 px-2 text-xs"
              disabled={nothingTyped}
              onClick={() => void copyForStudio()}
            >
              <ClipboardCopy className="h-3 w-3" aria-hidden />
              Copy to YouTube Studio
            </Button>
            {nothingTyped ? (
              <span className="text-[11px] leading-4 text-muted-foreground">
                There is nothing to copy yet.
              </span>
            ) : (
              <span className="text-[11px] leading-4 text-muted-foreground">
                Copies the title, description and tags exactly as typed — nothing
                is added and nothing is sent.
              </span>
            )}
          </div>
        </div>
      </div>

      <ClipboardFallbackDialog
        open={clipboardFallback !== null}
        onOpenChange={(open) => (open ? undefined : setClipboardFallback(null))}
        url={clipboardFallback ?? ""}
        title="Copy this into YouTube Studio"
        description="The clipboard was not available. Press Cmd/Ctrl+C to copy the title, description and tags."
      />
    </section>
  );
}
