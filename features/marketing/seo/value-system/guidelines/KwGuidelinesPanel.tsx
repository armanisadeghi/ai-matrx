"use client";

/**
 * KW business guidelines editor — the per-site prose document the AI reads
 * before it rules on a keyword (D35, ratified 2026-08-21).
 *
 * The problem it solves, in Arman's words: "the agent wouldn't know CRT is a
 * horrible keyword unless there's some document that guides it and we keep
 * these things up to date." Every classification/valuation agent call for this
 * site carries this text as a named agent variable — so what the expert writes
 * here changes what the AI decides, immediately, with no prompt engineering
 * and no chat memory.
 *
 * Two things this panel must always do, because they are what makes the
 * document trustworthy:
 *  - Show its PROVENANCE (who last wrote it, when, which version). A document
 *    that silently rots is worse than no document.
 *  - Say plainly WHERE it is used, so the expert knows the cost of a sentence.
 *
 * ONE write path (`setKwGuidelines` → `seo.gsc_set_site_kw_guidelines`); never
 * write `web.site.settings` directly for this key.
 *
 * 🚨 2026-08-25 (KI-031) — THE BLANK PAGE WAS THE BUG. The delivery machinery
 * was built and A/B-proven and 1 of 32 sites had a document, because writing
 * one from an empty textarea is unprompted homework. This panel now opens with
 * an offer instead of an empty box: `GuidelinesDraftButton` runs the Business
 * Discovery Ladder's drafting rung on the site's own pages, and the result
 * arrives as a PROPOSAL in the queue above the editor — approve it, or edit it
 * and then approve it. An AI draft is never written straight into the document
 * (P12); the queue's approval replays it through the same write path a person
 * clicking Save uses.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  Check,
  Clock,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import {
  getKwGuidelines,
  kwGuidelinesQueryKey,
  setKwGuidelines,
} from "@/features/marketing/search-console/data-kw-guidelines";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";
import { selectAssistsForSurface } from "@/features/assists/redux/assistsSlice";
import {
  KEYWORD_MEANING_SURFACE,
  KeywordMeaningSuggestions,
} from "../suggestions/KeywordMeaningSuggestions";
import { GuidelinesDraftButton } from "./GuidelinesDraft";
import { GUIDELINES_STALE_AFTER_DAYS } from "./GuidelinesGapPrompt";

/** After this long without an edit the document is called out as possibly
 *  stale — "we keep these things up to date" is half the ruling. ONE line,
 *  shared with the gap prompt and `seo.gsc_site_meaning_health`. */
const STALE_AFTER_DAYS = GUIDELINES_STALE_AFTER_DAYS;

/** This screen owns ONE subject, so its queue shows one kind of proposal. */
const GUIDELINE_KINDS = ["guideline_edit"] as const;

/** Section headings only — an outline the expert fills in, never invented
 *  business claims. Industry starter packs (D36) will seed real content. */
const STARTER_OUTLINE = `What this business sells
- 

Who the good customer is
- 

Words that look relevant but are NOT our customer
- 

Words outsiders get wrong about our industry
- 

Where we serve (and where we do not)
- 
`;

const PLACEHOLDER =
  'e.g. "We serve corporations, never consumers. CRT, TV and monitor repair ' +
  "queries are consumer signals — they are never our customer, no matter how " +
  'much traffic they bring."';

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

export function KwGuidelinesPanel({
  siteId,
  onSaved,
}: {
  siteId: string;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);

  const stored = useQuery({
    queryKey: kwGuidelinesQueryKey(siteId),
    queryFn: ({ signal }) => getKwGuidelines(siteId, signal),
  });

  const savedText = stored.data?.guidelines ?? "";
  // Adopt server truth until the expert starts typing; a save clears the draft
  // so the panel snaps back to what the server actually stored.
  const value = draft ?? savedText;
  const dirty = draft !== null && draft !== savedText;

  useEffect(() => {
    setDraft(null);
  }, [siteId]);

  const save = useMutation({
    mutationFn: (text: string) => setKwGuidelines(siteId, text),
    onSuccess: (row) => {
      setDraft(null);
      queryClient.setQueryData(kwGuidelinesQueryKey(siteId), row);
      void queryClient.invalidateQueries({
        queryKey: kwGuidelinesQueryKey(siteId),
      });
      toast.success(
        row.guidelines
          ? `Guidelines saved (v${row.guidelines_version})`
          : "Guidelines cleared",
        {
          description: row.guidelines
            ? "Every AI classification and valuation run for this site now reads this document."
            : "AI runs for this site will classify from universal signals only.",
        },
      );
      onSaved?.();
    },
    onError: (error) =>
      toast.error("Could not save the guidelines", {
        description: extractErrorMessage(error),
      }),
  });

  /**
   * Approving a guidelines proposal writes the document through
   * `seo.gsc_set_site_kw_guidelines` — but it happens inside the assist CARD,
   * which knows nothing about this panel's query. Measured live 2026-08-25:
   * the toast said "this is now part of how your keywords are read" while the
   * editor two inches below still read "Never written". A receipt that
   * contradicts the screen it is on teaches people not to trust the receipt.
   *
   * So the panel watches its own queue: when a guidelines proposal for this
   * site leaves the pending list — approved, rejected, or dismissed — the
   * document is re-read from the server. Every consumer shares the query key,
   * so the gap prompts on the other screens settle with it.
   */
  const pendingGuidelineIds = useAppSelector((state: RootState) =>
    selectAssistsForSurface(state, KEYWORD_MEANING_SURFACE),
  )
    .filter(
      (assist) =>
        assist.action.kind === "apply_keyword_meaning" &&
        assist.action.siteId === siteId &&
        assist.action.proposal.proposal === "guideline_edit",
    )
    .map((assist) => assist.id)
    .sort()
    .join(",");

  useEffect(() => {
    void queryClient.invalidateQueries({
      queryKey: kwGuidelinesQueryKey(siteId),
    });
  }, [pendingGuidelineIds, queryClient, siteId]);

  const age = daysSince(stored.data?.updated_at ?? null);
  const stale = age !== null && age > STALE_AFTER_DAYS;

  const provenance = useMemo(() => {
    const row = stored.data;
    if (!row?.updated_at) return null;
    const when = new Date(row.updated_at);
    const who = row.updated_by_name ?? "someone on this site";
    return `v${row.guidelines_version} · last edited by ${who} on ${when.toLocaleDateString()}${
      age !== null
        ? ` (${age === 0 ? "today" : `${age} day${age === 1 ? "" : "s"} ago`})`
        : ""
    }`;
  }, [stored.data, age]);

  const submit = async () => {
    const next = value.trim();
    if (!next && savedText) {
      const ok = await confirm({
        title: "Clear the keyword guidelines?",
        description:
          "AI classification and valuation for this site will run without any business context — the model will not know which terms are wrong for you.",
        variant: "destructive",
        confirmLabel: "Clear",
      });
      if (!ok) return;
    }
    save.mutate(next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain pt-2">
      <p className="text-xs leading-snug text-muted-foreground">
        What the AI must know about{" "}
        <span className="font-medium text-foreground">this business</span>{" "}
        before it judges a keyword. Every AI classification and valuation run
        for this site reads this document first — write the things a smart
        outsider would get wrong. Plain sentences beat rules; name the terms
        themselves.
      </p>

      {stored.isError ? (
        <InlineQueryError
          what="Keyword guidelines"
          error={stored.error}
          onRetry={() => void stored.refetch()}
        />
      ) : null}

      {/* Whatever an agent proposed about this document, waiting on a person.
          It sits ABOVE the editor because a draft you have not read is the
          most useful thing on this screen. */}
      <KeywordMeaningSuggestions siteId={siteId} kinds={GUIDELINE_KINDS} />

      {/* The editor is where you LAND from every prompt, so the offer has to
          be here too — an empty textarea with no way out is the whole bug. */}
      {!stored.isLoading && !savedText ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-2">
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">
            You do not have to start from a blank page — we can read your own
            site and propose a draft for you to correct. Nothing is saved until
            you approve it.
          </span>
          <GuidelinesDraftButton siteId={siteId} hasDocument={false} />
        </div>
      ) : null}

      {stale ? (
        <p className="flex items-start gap-1.5 rounded-md border border-warning/60 bg-warning/10 px-2 py-1.5 text-[11px] leading-snug text-warning">
          <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
          <span>
            Not edited in {age} days. The AI is still ruling on every keyword
            from this text — re-read it before the next classification sweep.
            An out-of-date sentence keeps deciding things long after it stopped
            being true.
          </span>
        </p>
      ) : null}

      <Textarea
        value={value}
        onChange={(event) => setDraft(event.target.value)}
        disabled={stored.isLoading || save.isPending}
        spellCheck
        placeholder={PLACEHOLDER}
        className="min-h-[16rem] flex-1 resize-none font-mono text-xs leading-relaxed"
      />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {stored.isLoading ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </>
          ) : provenance ? (
            <>
              <Clock className="h-3 w-3" /> {provenance}
            </>
          ) : (
            <>
              <BookOpenCheck className="h-3 w-3" /> Never written — AI runs for
              this site carry no business context yet.
            </>
          )}
        </span>

        <span className="flex items-center gap-1.5">
          {!savedText && !value ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => setDraft(STARTER_OUTLINE)}
            >
              Start an outline
            </Button>
          ) : null}
          {savedText && !dirty ? (
            <GuidelinesDraftButton siteId={siteId} hasDocument />
          ) : null}
          {dirty ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              disabled={save.isPending}
              onClick={() => setDraft(null)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Discard
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!dirty || save.isPending}
            onClick={() => void submit()}
          >
            {save.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            Save
          </Button>
        </span>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Used by: <span className="text-foreground">Classify with AI</span> on
        this workbench, and every valuation agent that reasons about this
        site&apos;s keywords. It never overrides your explicit rulings — a
        keyword you ruled by hand always wins.
      </p>
    </div>
  );
}
