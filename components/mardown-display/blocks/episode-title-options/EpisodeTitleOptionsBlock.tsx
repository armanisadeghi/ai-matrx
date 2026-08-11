"use client";

/**
 * EpisodeTitleOptionsBlock — renderer for the `episode_title_options` kind.
 *
 * Ranked title candidates as cards; each carries Copy and — when the page it
 * landed on offers the target — a "Use this title" button that persists the
 * choice.
 *
 * ## Surface-aware apply — the same 360 loop KeywordResearchBlock proved
 *
 * The block takes no interaction props (it renders through `BlockRenderer`,
 * which hands a block its data and nothing else). It talks to whatever page
 * it is on through the two surface seams, naming a target and nothing else:
 *
 *   READ   `useCurrentSurfaceUiState("episode_title_selection")` — the
 *          episode's current title, so the matching card reads "Current"
 *          instead of offering a no-op apply. Absent (chat, a share page) ⇒
 *          read-only cards with Copy. Same block, every surface.
 *   WRITE  `runAction("apply_surface_write", { target: "episode_title" })` —
 *          the page's declared handler decides what applying MEANS there
 *          (on the podcast run page: `podcastService.updateEpisode`, which
 *          refuses mid-run and before the episode row exists).
 *
 * The block never learns which surface it is on, never receives a callback,
 * and cannot reach the page's state directly — so the same cards work
 * identically inside the floating live-run window, inline on the run page,
 * and in a chat transcript months later.
 *
 * Consumes the streaming bridge serverData from
 * features/content-ir/kinds/episode-title-options.ts, so cards appear
 * one-by-one as the model writes them.
 */

import { useCallback, useState } from "react";
import { Check, Copy, Loader2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKindActionRunner } from "@/features/content-ir/react/actions/useKindActionRunner";
import { useCurrentSurfaceUiState } from "@/features/surfaces/runtime/surface-ui-state";
import {
  EPISODE_TITLE_UI_STATE_KEY,
  EPISODE_TITLE_WRITE_TARGET,
  type EpisodeTitleOptionData,
  type EpisodeTitleOptionsData,
} from "@/features/content-ir/kinds/episode-title-options";

export interface EpisodeTitleOptionsBlockProps {
  serverData?: unknown;
}

/**
 * The shape a page publishes under the `episode_title_selection` UI-state
 * key. Publishing it is what makes the cards interactive; publishing
 * `undefined` (or nothing) leaves them read-only.
 */
export interface EpisodeTitleUiState {
  /** The episode's current title — that card renders as "Current". */
  current?: string | null;
}

/** The value `apply_surface_write` carries for the `episode_title` target. */
export interface EpisodeTitleWriteValue {
  title: string;
}

function isOption(value: unknown): value is EpisodeTitleOptionData {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EpisodeTitleOptionData).title === "string"
  );
}

function readData(serverData: unknown): EpisodeTitleOptionsData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<EpisodeTitleOptionsData>;
  if (!Array.isArray(candidate.options)) return null;
  const options = candidate.options.filter(isOption);
  if (options.length === 0) return null;
  return {
    workingTitle:
      typeof candidate.workingTitle === "string" ? candidate.workingTitle : null,
    options,
    isComplete: candidate.isComplete === true,
  };
}

function CopyTitleButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(title).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [title]);
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Copy title"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ApplyTitleButton({ title }: { title: string }) {
  const runAction = useKindActionRunner();
  const [applying, setApplying] = useState(false);

  const handleApply = useCallback(async () => {
    if (applying) return;
    setApplying(true);
    // The runner owns error handling (toast + capture) and never throws; the
    // envelope only drives this button's busy state. A refused write (mid-run,
    // no episode) leaves the page untouched and says so loudly.
    await runAction("apply_surface_write", {
      target: EPISODE_TITLE_WRITE_TARGET,
      value: { title } satisfies EpisodeTitleWriteValue,
      // A real click by the viewer — the click IS the consent, so the
      // target's applyPolicy is not consulted. Anything this component did on
      // its OWN would have to omit this and be gated. See
      // features/content-ir/react/actions/handlers/apply-surface-write.ts.
      origin: "user",
    });
    setApplying(false);
  }, [applying, runAction, title]);

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="shrink-0 gap-1"
      disabled={applying}
      onClick={() => void handleApply()}
    >
      {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Use this title
    </Button>
  );
}

function TitleOptionCard({
  option,
  interactive,
  isCurrent,
}: {
  option: EpisodeTitleOptionData;
  interactive: boolean;
  isCurrent: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {option.title}
          </p>
          {option.subtitle ? (
            <p className="text-sm text-muted-foreground">{option.subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <CopyTitleButton title={option.title} />
          {isCurrent ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
              <Check className="h-3 w-3" />
              Current
            </span>
          ) : interactive ? (
            <ApplyTitleButton title={option.title} />
          ) : null}
        </div>
      </div>
      {option.rationale ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {option.rationale}
        </p>
      ) : null}
    </div>
  );
}

export default function EpisodeTitleOptionsBlock({
  serverData,
}: EpisodeTitleOptionsBlockProps) {
  // Whatever page this block landed on, if it offers the title. Undefined
  // everywhere else — chat renders the same block read-only.
  const titleState = useCurrentSurfaceUiState<EpisodeTitleUiState>(
    EPISODE_TITLE_UI_STATE_KEY,
  );
  const data = readData(serverData);
  if (!data) return null;

  // A surface that publishes the key is offering the apply. One that does not
  // gets read-only cards — never a dead button.
  const interactive = titleState !== undefined;
  const currentTitle = titleState?.current?.trim() ?? null;

  return (
    <div className="my-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Type className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Title options
        </span>
        {!data.isComplete && (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      {data.workingTitle ? (
        <p className="text-xs text-muted-foreground">
          Current title: {data.workingTitle}
        </p>
      ) : null}
      <div className="space-y-2">
        {data.options.map((option, index) => (
          <TitleOptionCard
            key={`${index}-${option.title}`}
            option={option}
            interactive={interactive}
            isCurrent={currentTitle !== null && currentTitle === option.title}
          />
        ))}
      </div>
    </div>
  );
}
