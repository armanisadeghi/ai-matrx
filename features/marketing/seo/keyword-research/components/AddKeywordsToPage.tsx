"use client";

/**
 * Attach researched keywords to a page as supporting keywords.
 *
 * The keyword twin of `ApplyMetaToPage`: an agent researches twenty keywords
 * in chat, the user spots the three worth targeting, and until now had to
 * retype them into the Page Workspace one at a time.
 *
 * Writes through `addPageSupportingKeywords` — the canonical chokepoint that
 * upserts each phrase into the keyword library and creates the
 * `seo_keyword → web_page` association edge. No second keyword-writing path.
 */

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { PagePickerDialog } from "@/features/marketing/components/pages/PagePickerDialog";
import { addPageSupportingKeywords } from "@/features/marketing/data/page-keywords";
import type { MetaApplyTarget } from "@/features/marketing/types";

export interface AddKeywordsToPageProps {
  /** Phrases to attach. Empty renders nothing. */
  keywords: string[];
  className?: string;
}

export function AddKeywordsToPage({
  keywords,
  className,
}: AddKeywordsToPageProps) {
  const [open, setOpen] = useState(false);
  const [attachedUrl, setAttachedUrl] = useState<string | null>(null);

  if (!keywords.length) return null;

  const attach = async (page: MetaApplyTarget) => {
    try {
      const result = await addPageSupportingKeywords(page.id, keywords);
      if (result.failed.length) {
        // Partial success is reported as partial — never rounded up to "done".
        toast.warning(
          `Attached ${result.attached.length} of ${keywords.length} keywords`,
          {
            description: result.failed
              .map((f) => `${f.phrase}: ${f.error}`)
              .join(" · "),
          },
        );
      } else {
        toast.success(
          `Attached ${result.attached.length} keyword${result.attached.length === 1 ? "" : "s"}`,
          { description: page.url },
        );
      }
      if (result.attached.length) setAttachedUrl(page.url);
    } catch (error) {
      toast.error("Could not attach keywords", {
        description:
          error instanceof Error ? error.message : "The write was rejected.",
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
        title="Attach these keywords to a page"
        className={cn(
          "flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        {attachedUrl ? (
          <Check className="size-3 text-success" />
        ) : (
          <Plus className="size-3" />
        )}
        {attachedUrl
          ? "Attached"
          : `Add ${keywords.length} to page`}
      </button>

      <PagePickerDialog
        open={open}
        onOpenChange={setOpen}
        title="Attach keywords to page"
        description="Adds them as supporting keywords on the page you choose."
        confirmLabel="Attach"
        onConfirm={attach}
        preview={() => (
          <div className="grid gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {keywords.length} keyword{keywords.length === 1 ? "" : "s"}
            </span>
            <div className="flex flex-wrap gap-1">
              {keywords.map((phrase) => (
                <span
                  key={phrase}
                  className="rounded-md border border-border bg-card px-1.5 py-0.5 text-xs text-foreground"
                >
                  {phrase}
                </span>
              ))}
            </div>
          </div>
        )}
      />
    </>
  );
}
