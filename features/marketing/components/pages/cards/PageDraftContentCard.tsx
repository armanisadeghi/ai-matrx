"use client";

/**
 * PageDraftContentCard — the authored draft content for a canonical page.
 * The desired twin of PageContentCard (observed captured markdown): a real
 * notes-family editor (BasicContentEditor → NoteEditorCore) writing to the
 * 1:1 `web.page_content` row via EXPLICIT save (Arman's ruling — no
 * autosave), with a dirty indicator and a navigate-away guard. The editor is
 * heavy client code — code-split behind ONE dynamic edge.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { usePageContent, useSavePageContent } from "@/features/marketing/data/hooks";
import type { MarketingPage } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";

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
  const value = draft ?? serverContent;
  const dirty = draft !== null && draft !== serverContent;

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
      <div className="grid gap-2 p-3">
        {contentQuery.isLoading ? (
          <div className="h-48 animate-pulse rounded-lg border border-border bg-muted/40" />
        ) : (
          <div className="min-h-[20rem]">
            <BasicContentEditorLazy
              content={value}
              onChange={setDraft}
              placeholder="Write the content this page SHOULD have — markdown, saved on demand."
              resetKey={`${page.id}:${row?.version ?? 0}`}
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
