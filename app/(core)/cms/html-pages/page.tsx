"use client";

import React, { Suspense, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useHtmlPagesManager } from "@/features/html-pages/hooks/useHtmlPagesManager";
import HtmlPageListView from "@/features/html-pages/components/HtmlPageListView";
import { HtmlPagesContextMenu } from "@/features/html-pages/components/HtmlPagesContextMenu";
import { CmsHubHeader } from "@/features/cms/components/CmsHubHeader";
import {
  LoadingTapButton,
  PlusTapButton,
} from "@/components/icons/tap-buttons";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  consumeHtmlPagesListScroll,
  readHtmlPagesListReturn,
  saveHtmlPagesListReturn,
  saveHtmlPagesListScroll,
} from "@/features/html-pages/utils/list-url-state";

const BLANK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Page</title>
</head>
<body>
  <h1>New Page</h1>
  <p>Edit this page in the CMS.</p>
</body>
</html>`;

function HtmlPagesListBody() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigatingId, setNavigatingId] = React.useState<string | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [restoreScrollTop] = React.useState<number | null>(() =>
    consumeHtmlPagesListScroll(),
  );
  const { pages, isLoading, error, refresh, deletePage, createPage } =
    useHtmlPagesManager();

  const openPage = (
    pageId: string,
    opts?: { e?: React.MouseEvent; tab?: "preview" | "meta" | "html" },
  ) => {
    const e = opts?.e;
    if (e && (e.metaKey || e.ctrlKey)) return;
    e?.preventDefault();
    if (navigatingId) return;

    const el = scrollRef.current;
    if (el) saveHtmlPagesListScroll(el.scrollTop);

    const ret =
      typeof window !== "undefined"
        ? window.location.search.replace(/^\?/, "") || readHtmlPagesListReturn()
        : readHtmlPagesListReturn();
    saveHtmlPagesListReturn(ret);

    const params = new URLSearchParams();
    if (opts?.tab) params.set("tab", opts.tab);
    if (ret) params.set("ret", ret);
    const qs = params.toString();
    const href = qs
      ? `/cms/html-pages/${pageId}?${qs}`
      : `/cms/html-pages/${pageId}`;

    setNavigatingId(pageId);
    startTransition(() => {
      router.push(href);
    });
  };

  const handleCreate = async () => {
    setIsCreating(true);
    try {
      const result = await createPage({
        htmlContent: BLANK_HTML,
        metaTitle: "New Page",
        metaDescription: "",
        metaFields: { isIndexable: false },
        forceNew: true,
      });
      toast.success("Page created");
      openPage(result.pageId, { tab: "meta" });
    } catch {
      toast.error("Failed to create page");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <CmsHubHeader
        right={
          isCreating ? (
            <LoadingTapButton ariaLabel="Creating page" disabled />
          ) : (
            <PlusTapButton
              variant="transparent"
              ariaLabel="New page"
              onClick={() => void handleCreate()}
              disabled={isPending}
            />
          )
        }
      />

      <HtmlPagesContextMenu
        pages={pages}
        onNewPage={() => void handleCreate()}
        onOpenPage={(pageId) => openPage(pageId)}
      >
        <div
          ref={scrollRef}
          className="h-full overflow-auto pt-[var(--shell-header-h)] relative"
        >
          {(isPending || navigatingId) && (
            <div className="absolute inset-0 z-10 bg-background/40 flex items-center justify-center pointer-events-none">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          <HtmlPageListView
            pages={pages}
            isLoading={isLoading}
            error={error}
            onOpenPage={openPage}
            onCreatePage={() => void handleCreate()}
            onDeletePage={async (pageId) => {
              await deletePage(pageId);
            }}
            onRefresh={() => void refresh()}
            scrollContainerRef={scrollRef}
            restoreScrollTop={restoreScrollTop}
          />
        </div>
      </HtmlPagesContextMenu>
    </>
  );
}

export default function HtmlPagesListPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full pt-[var(--shell-header-h)] text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <HtmlPagesListBody />
    </Suspense>
  );
}
