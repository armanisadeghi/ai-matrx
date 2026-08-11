"use client";

/**
 * PageDraftContentCard — the authored draft content for a canonical page.
 * The desired twin of PageContentCard (observed captured markdown): a real
 * notes-family editor (BasicContentEditor → NoteEditorCore) writing to the
 * 1:1 `web.page_content` row via EXPLICIT save (Arman's ruling — no
 * autosave), with a dirty indicator and a navigate-away guard. The editor is
 * heavy client code — code-split behind ONE dynamic edge.
 *
 * Also the receiving end of the `page_draft_content` surface write target
 * (mode "draft"): an agent's proposed body lands in this card's UNSAVED draft
 * state — the user still reviews and saves. The handler lives here (not in
 * MarketingPageWriteTargets) because this component owns that state.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import {
  usePageContent,
  useSavePageContent,
} from "@/features/marketing/data/hooks";
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { MARKETING_PAGE_SURFACE_NAME } from "@/features/marketing/lib/marketing-page-scope";
import type { MarketingPage } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

/** Wire value for the `page_draft_content` surface write target. */
export interface PageDraftContentWrite {
  markdown: string;
  /** `"replace"` (default) swaps the staged draft; `"append"` adds after it. */
  mode?: "replace" | "append";
}

const BasicContentEditorLazy = dynamic(
  () =>
    import("@/components/content-refine/BasicContentEditor").then(
      (mod) => mod.BasicContentEditor,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="m-3 h-48 animate-pulse rounded-lg border border-border bg-muted/40" />
    ),
  },
);

export function PageDraftContentCard({ page }: { page: MarketingPage }) {
  const contentQuery = usePageContent(page.site_id, page.id);
  const saveMutation = useSavePageContent();
  const row = contentQuery.data ?? null;
  const serverContent = row?.content ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  // Bumped when a surface write stages content externally — the rich editor
  // panes seed from `content` only on reset, so an external swap must bump
  // the resetKey or the staged markdown never becomes visible.
  const [stagedNonce, setStagedNonce] = useState(0);
  const value = draft ?? serverContent;
  const dirty = draft !== null && draft !== serverContent;

  // The `page_draft_content` write target (mode "draft"): an agent's proposed
  // body is STAGED into this card's unsaved-draft state — the user reviews and
  // clicks Save draft; nothing persists here. The handler ref stays fresh, so
  // reading `value` at call time is safe. Throws are surfaced loudly by the
  // writeback runtime (toast + captured error).
  useSurfaceWriteHandlers(MARKETING_PAGE_SURFACE_NAME, {
    page_draft_content: (raw: unknown) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(
          "page_draft_content expects { markdown: string, mode?: 'replace' | 'append' }.",
        );
      }
      const write = raw as Partial<PageDraftContentWrite>;
      if (typeof write.markdown !== "string" || !write.markdown.trim()) {
        throw new Error(
          "page_draft_content: markdown must be a non-empty string.",
        );
      }
      const mode = write.mode ?? "replace";
      if (mode !== "replace" && mode !== "append") {
        throw new Error(
          `page_draft_content: mode must be 'replace' or 'append', got "${String(write.mode)}".`,
        );
      }
      if (contentQuery.isLoading || contentQuery.isError) {
        // Appending onto (or replacing) a draft we haven't loaded yet would
        // silently clobber the user's saved content — refuse loudly instead.
        throw new Error(
          "page_draft_content: the current draft has not loaded yet — try again in a moment.",
        );
      }
      setDraft(
        mode === "append" && value.trim()
          ? `${value.replace(/\s+$/, "")}\n\n${write.markdown}`
          : write.markdown,
      );
      setStagedNonce((n) => n + 1);
    },
  });

  // Navigate-away guard — an unsaved draft must never silently vanish.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const save = async () => {
    try {
      await saveMutation.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        content: value,
        expectedVersion: row ? row.version : null,
      });
      setDraft(null);
      toast.success("Draft content saved");
    } catch (error) {
      toast.error("Could not save draft content", {
        description: extractErrorMessage(error),
      });
    }
  };

  const copy = webCopy({
    kind: "web-page-draft-content",
    label: "Draft content",
    description:
      "The authored draft content for this page — the editorial target, separate from the observed captured content.",
    surface: `Draft content — ${page.url}`,
    data: {
      url: page.url,
      draft_content: serverContent,
      draft_updated_at: row?.updated_at ?? null,
    },
    lines: [
      ["URL", page.url],
      ["Draft length", serverContent.length],
      ["Last saved", row?.updated_at ?? "never"],
    ],
    attributes: { page_id: page.id },
  });

  return (
    <SectionCard
      title="Draft content"
      copy={copy}
      collapsible
      anchor="draft_content"
      headerExtra={
        dirty ? (
          <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
            Unsaved changes
          </span>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        {contentQuery.isLoading ? (
          <div className="h-48 animate-pulse rounded-lg border border-border bg-muted/40" />
        ) : (
          <div className="relative min-h-[20rem] flex-1">
            <BasicContentEditorLazy
              content={value}
              onChange={setDraft}
              placeholder="Write the content this page SHOULD have — markdown, saved on demand."
              resetKey={`${page.id}:${row?.version ?? 0}:${stagedNonce}`}
              className="absolute inset-0"
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button
            size="sm"
            className="h-8"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => void save()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save draft
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
