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
import { updatePageIntent } from "@/features/marketing/data/service";
import type { MetaApplyTarget } from "@/features/marketing/types";

export interface ApplyMetaToPageProps {
  title?: string;
  description?: string;
  className?: string;
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

  if (!title && !description) return null;

  const apply = async (page: MetaApplyTarget) => {
    try {
      const saved = await updatePageIntent({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: page.version,
        // An intent save writes all three fields together, so anything this
        // apply does not supply must be PRESERVED. A title-only result
        // (action=check_titles) must never blank the page's description.
        targetKeyword: page.target_keyword,
        desiredMetaTitle: title ?? page.meta_title_desired,
        desiredMetaDescription: description ?? page.meta_description_desired,
      });
      setAppliedUrl(saved.url);
      toast.success("Applied to page", { description: saved.url });
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
        title="Apply this title/description to a page"
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
              next={title}
            />
            <FieldDiff
              label="Description"
              current={page.meta_description_desired}
              next={description}
            />
          </>
        )}
      />
    </>
  );
}
