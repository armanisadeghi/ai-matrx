"use client";

/**
 * Apply a generated title/description to a real page's DESIRED metadata.
 *
 * This closes the loop that used to dead-end: an agent generates five candidate
 * titles in chat, the user reads them, and then has to retype the winner into
 * the marketing Page Workspace by hand. Now the candidate itself is actionable.
 *
 * Lives in the SERP core (not in the tool renderer) on purpose: ANY surface
 * that renders a SERP entry — chat tool result, page workspace, the Search
 * Appearance analyzer, a future bulk view — gets the same action for free.
 *
 * The write goes through `updatePageIntent`, the ONE canonical desired-metadata
 * path: optimistically locked on `version` and it recomputes
 * `seo_metrics_desired` with the deterministic evaluator, so numbers written
 * from chat are byte-identical to numbers written from the workspace.
 */

import { useState } from "react";
import { ArrowRight, Check, Send } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { PagePickerDialog } from "@/features/marketing/components/pages/PagePickerDialog";
import { useUpdatePageIntent } from "@/features/marketing/data/hooks";
import type { MetaApplyTarget } from "@/features/marketing/types";

export interface ApplyMetaToPageProps {
  title?: string;
  description?: string;
  className?: string;
}

/**
 * An empty string is a REAL result here, not a missing value: `check_batch`
 * reports a page whose `<title>` is absent as `title: ""` — precisely the
 * finding the check exists to produce. Treating it as a value would blank the
 * user's desired title on apply, so blank-or-absent both mean "not supplied".
 */
function supplied(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? value : undefined;
}

/** One field's before → after. Renders nothing for a field this apply omits. */
function FieldDiff({
  label,
  current,
  next,
}: {
  label: string;
  current: string | null;
  next?: string;
}) {
  if (!next) return null;
  const unchanged = current === next;
  return (
    <div className="grid gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {current ? (
        <span
          className={cn(
            "text-xs text-muted-foreground",
            !unchanged && "line-through",
          )}
        >
          {current}
        </span>
      ) : (
        <span className="text-xs italic text-muted-foreground">not set</span>
      )}
      <span className="flex items-start gap-1.5 text-sm text-foreground">
        <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
        <span>{next}</span>
      </span>
      {unchanged ? (
        <span className="text-[11px] text-muted-foreground">
          Already the desired {label.toLowerCase()} on this page.
        </span>
      ) : null}
    </div>
  );
}

export function ApplyMetaToPage({
  title,
  description,
  className,
}: ApplyMetaToPageProps) {
  const [open, setOpen] = useState(false);
  const [appliedUrl, setAppliedUrl] = useState<string | null>(null);
  // Both consumers key their rows by array INDEX, so a re-resolve that
  // reorders entries would otherwise leave this instance showing "Applied"
  // for a title it never applied. Reset whenever the content changes.
  const contentKey = `${title ?? ""}|${description ?? ""}`;
  const [appliedFor, setAppliedFor] = useState(contentKey);
  if (appliedFor !== contentKey) {
    setAppliedFor(contentKey);
    setAppliedUrl(null);
  }
  // The canonical mutation, NOT the bare service call — its onSuccess
  // invalidation is what keeps an open Page Workspace from showing stale
  // desired values (and from failing its own next write on a stale version).
  const updateIntent = useUpdatePageIntent();

  const nextTitle = supplied(title);
  const nextDescription = supplied(description);
  if (!nextTitle && !nextDescription) return null;

  const apply = async (page: MetaApplyTarget) => {
    try {
      const saved = await updateIntent.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: page.version,
        // An intent save writes all three fields together, so anything this
        // apply does not supply must be PRESERVED. A title-only result
        // (action=check_titles) must never blank the page's description.
        targetKeyword: page.target_keyword,
        desiredMetaTitle: nextTitle ?? page.meta_title_desired,
        desiredMetaDescription:
          nextDescription ?? page.meta_description_desired,
      });
      setAppliedUrl(saved.url);
      toast.success("Applied to page", { description: saved.url });
      return saved;
    } catch (error) {
      toast.error("Could not apply to page", {
        description:
          error instanceof Error
            ? error.message
            : "The page may have changed in another session.",
      });
      throw error;
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        title={
          appliedUrl
            ? `Applied to ${appliedUrl} — apply to another page`
            : "Apply this title/description to a page"
        }
        className={cn(
          "flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        {appliedUrl ? (
          <Check className="size-3 text-success" />
        ) : (
          <Send className="size-3" />
        )}
        {appliedUrl ? "Applied" : "Apply to page"}
      </button>

      <PagePickerDialog
        open={open}
        onOpenChange={setOpen}
        title="Apply to page"
        description="Saves as the page's desired metadata. It does not publish anything to the live site."
        confirmLabel="Apply"
        onConfirm={apply}
        preview={(page) => (
          <>
            <FieldDiff
              label="Title"
              current={page.meta_title_desired}
              next={nextTitle}
            />
            <FieldDiff
              label="Description"
              current={page.meta_description_desired}
              next={nextDescription}
            />
          </>
        )}
      />
    </>
  );
}
