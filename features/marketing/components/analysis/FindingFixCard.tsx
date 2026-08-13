"use client";

/**
 * FindingFixCard — the surface that CLOSES the Growth Loop (`G-FINDING-FIX`).
 *
 * Everything before it turned a crawl into a finding and offered the finding to
 * the user. Nothing turned an accepted finding into a changed page. This card
 * is that step, and it carries all THREE PIPES for `suggest → writeback` in one
 * place (common-docs/systems/growth-loop/VISION.md):
 *
 *   CODE  — `planDeterministicFix` drafts instantly and for free when the fix
 *           is genuinely derivable (a too-long title is a trimming problem, a
 *           missing description when the page already publishes a social one).
 *   AI    — when code correctly declines, the purpose-built SEO Finding Fixer
 *           (aidream slot `seo.finding_fixer`) writes the replacement text.
 *   HUMAN — the user reads the before/after, and only their click applies it.
 *
 * SAFETY, non-negotiable: applying writes the page's DESIRED metadata and a CMS
 * DRAFT through `applyFindingFix` — the seams that already existed. It never
 * publishes, never moves a route (THE 301 LAW), and never creates a CMS page.
 * The live client site is unchanged until a human publishes the draft in the
 * CMS. That is why the button says "as a draft" and the receipt names where it
 * landed.
 */

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  ShieldAlert,
  Sparkles,
  Wand2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { usePageWorkspace } from "@/features/marketing/data/hooks";
import type { FindingFixDraft } from "@/features/marketing/lib/finding-fix";
import { planDeterministicFix } from "@/features/marketing/lib/finding-fix";
import { applyFindingFix } from "@/features/marketing/lib/finding-fix-apply";
import type { FixCmsOutcome } from "@/features/marketing/lib/finding-fix-apply";
import { buildFindingFixEvidence } from "@/features/marketing/lib/finding-fix-evidence";
import type { MarketingSite } from "@/features/marketing/types";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import {
  useFindingFixer,
  type FindingFixProposal,
} from "@/features/marketing/components/analysis/useFindingFixer";

/** Checks whose fix this card can actually land on the page today. */
const FIXABLE_ITEM_KEYS = new Set([
  "title_presence",
  "title_length",
  "meta_description_presence",
  "meta_description_length",
]);

export interface FindingFixCardProps {
  findingId: string;
  itemKey: string;
  site: MarketingSite;
  pageId: string | null;
  /** Door to the page workspace, for the receipt. */
  pageWorkspaceHref?: string | null;
}

type Pipe = "code" | "ai";

interface ReviewableDraft {
  pipe: Pipe;
  draft: FindingFixDraft;
  /** Only the AI pipe has one. */
  proposal?: FindingFixProposal;
}

function Field({
  label,
  before,
  after,
}: {
  label: string;
  before: string | null;
  after: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <span className="font-normal normal-case tracking-normal">
          {after.length} characters
        </span>
      </div>
      {before ? (
        <p className="rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground line-through decoration-muted-foreground/50">
          {before}
        </p>
      ) : (
        <p className="rounded border border-dashed border-border px-2 py-1.5 text-xs italic text-muted-foreground">
          Nothing here today — search engines are inventing this.
        </p>
      )}
      <div className="flex items-start gap-1.5">
        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="rounded border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs font-medium text-foreground">
          {after}
        </p>
      </div>
    </div>
  );
}

function cmsReceipt(cms: FixCmsOutcome): string {
  return cms.status === "drafted"
    ? `Saved to the page, and drafted on your live site at ${cms.route}. Nothing is public until you publish that draft.`
    : `Saved as the page's desired metadata. ${cms.reason}`;
}

export function FindingFixCard({
  findingId,
  itemKey,
  site,
  pageId,
  pageWorkspaceHref,
}: FindingFixCardProps) {
  const fixable = FIXABLE_ITEM_KEYS.has(itemKey) && Boolean(pageId);
  const workspace = usePageWorkspace(site.id, fixable ? (pageId as string) : "");
  const fixer = useFindingFixer(findingId, site.organization_id);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<ReviewableDraft | null>(null);

  const page = workspace.data?.page ?? null;
  const snapshot = workspace.data?.latestSnapshot ?? null;

  /** THE CODE PIPE — free, deterministic, instant. Null = correctly declined. */
  const codeDraft = useMemo(() => {
    if (!page) return null;
    return planDeterministicFix(
      buildFindingFixEvidence({ itemKey, page, snapshot, site }),
    );
  }, [itemKey, page, snapshot, site]);

  /** THE AI PIPE's draft, narrowed to the fields this card can apply. */
  const aiDraft = useMemo<FindingFixDraft | null>(() => {
    const proposal = fixer.state.result?.proposal;
    if (!proposal || proposal.verdict !== "fix_drafted") return null;
    const metaTitle = proposal.meta_title?.trim() || undefined;
    const metaDescription = proposal.meta_description?.trim() || undefined;
    if (!metaTitle && !metaDescription) return null;
    return {
      ...(metaTitle ? { metaTitle } : {}),
      ...(metaDescription ? { metaDescription } : {}),
      source: "the SEO Finding Fixer",
      rationale: proposal.reasoning,
    };
  }, [fixer.state.result]);

  if (!fixable) return null;

  const proposal = fixer.state.result?.proposal;
  const reviewable: ReviewableDraft | null = aiDraft
    ? { pipe: "ai", draft: aiDraft, proposal }
    : codeDraft
      ? { pipe: "code", draft: codeDraft }
      : null;

  const runApply = async (candidate: ReviewableDraft) => {
    if (!page) return;
    setApplying(true);
    try {
      const result = await applyFindingFix({
        site,
        page,
        draft: candidate.draft,
      });
      setApplied(cmsReceipt(result.cms));
      toast.success("Fix applied as a draft", {
        description: cmsReceipt(result.cms),
      });
      await workspace.refetch();
    } catch (error) {
      toast.error("Could not apply this fix", {
        description: extractErrorMessage(error),
      });
    } finally {
      setApplying(false);
      setConfirming(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <Wand2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <h2 className="text-xs font-semibold text-foreground">Fix this page</h2>
        {reviewable ? (
          <Badge variant="outline" className="h-5 text-[10px]">
            {reviewable.pipe === "code"
              ? "Drafted from the page itself"
              : "Written by the SEO Finding Fixer"}
          </Badge>
        ) : null}
      </div>

      <div className="space-y-3 px-3 py-3">
        {applied ? (
          <div className="flex items-start gap-2 rounded border border-success/40 bg-success/5 px-2 py-2 text-xs text-foreground">
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <div className="space-y-1">
              <p>{applied}</p>
              {pageWorkspaceHref ? (
                <a
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  href={pageWorkspaceHref}
                >
                  Open the page workspace
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {workspace.isLoading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading the page…
          </p>
        ) : null}

        {!applied && reviewable ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {reviewable.draft.rationale}
            </p>
            {reviewable.draft.metaTitle ? (
              <Field
                label="Title in search results"
                before={page?.meta_title_desired ?? null}
                after={reviewable.draft.metaTitle}
              />
            ) : null}
            {reviewable.draft.metaDescription ? (
              <Field
                label="Description in search results"
                before={page?.meta_description_desired ?? null}
                after={reviewable.draft.metaDescription}
              />
            ) : null}

            {reviewable.proposal?.risks?.length ? (
              <div className="flex items-start gap-2 rounded border border-warning/40 bg-warning/5 px-2 py-2 text-xs text-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <ul className="space-y-1">
                  {reviewable.proposal.risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="h-7"
                disabled={applying}
                onClick={() => setConfirming(reviewable)}
              >
                {applying ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Apply as a draft
              </Button>
              {reviewable.pipe === "code" && fixer.state.status === "idle" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5"
                  onClick={() => void fixer.run(false)}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Ask the fixer to write a better one
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {!applied && !reviewable && !workspace.isLoading ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {proposal
                ? proposal.reasoning
                : "This one needs judgement — the words are not already on the page. The SEO Finding Fixer reads the page, the words people actually search for, and your brand, then writes the exact replacement for you to approve."}
            </p>
            {proposal?.manual_instruction ? (
              <p className="whitespace-pre-wrap rounded border border-border bg-muted/40 px-2 py-1.5 text-xs text-foreground">
                {proposal.manual_instruction}
              </p>
            ) : null}
            {proposal?.missing_inputs?.length ? (
              <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                {proposal.missing_inputs.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {fixer.state.status === "running" ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {fixer.state.stage ?? "Writing the replacement text"}
              </p>
            ) : (
              <Button
                size="sm"
                className="h-7 gap-1.5"
                onClick={() => void fixer.run(fixer.state.status === "done")}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {fixer.state.status === "done"
                  ? "Try again"
                  : "Write the fix for me"}
              </Button>
            )}
            {fixer.state.status === "error" ? (
              <p className="text-xs text-destructive">{fixer.state.error}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
        title="Apply this fix as a draft?"
        description={
          "This saves the new wording on the page and, when this page exists on your linked website, writes it into that page's DRAFT. Nothing becomes public until you publish the draft yourself."
        }
        confirmLabel="Apply as a draft"
        busy={applying}
        onConfirm={() => {
          if (confirming) void runApply(confirming);
        }}
      />
    </section>
  );
}
