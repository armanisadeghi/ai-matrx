"use client";

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import type { HtmlPageRecord } from "@/features/html-pages/types";
import HtmlPageEditor from "@/features/html-pages/components/HtmlPageEditor";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  htmlPagesListHrefFromReturn,
  saveHtmlPagesListReturn,
} from "@/features/html-pages/utils/list-url-state";

function HtmlPageEditBody() {
  const { pageId } = useParams() as { pageId: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = useMemo(() => {
    const t = searchParams.get("tab");
    if (t === "preview" || t === "html" || t === "meta") return t;
    return undefined;
  }, [searchParams]);
  const backHref = useMemo(() => {
    const ret = searchParams.get("ret");
    if (ret) {
      saveHtmlPagesListReturn(ret);
      return `/cms/html-pages?${ret}`;
    }
    return htmlPagesListHrefFromReturn(null);
  }, [searchParams]);
  const [page, setPage] = useState<HtmlPageRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = (await HTMLPageService.getPage(pageId)) as HtmlPageRecord;
      setPage(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load page");
    } finally {
      setIsLoading(false);
    }
  }, [pageId]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage]);

  const handleSave = async (updates: {
    htmlContent?: string;
    metaTitle?: string;
    metaDescription?: string;
    metaFields?: {
      metaKeywords?: string;
      ogImage?: string;
      canonicalUrl?: string;
      isIndexable?: boolean;
    };
  }) => {
    setIsSaving(true);
    setError(null);
    try {
      await HTMLPageService.updatePage(
        pageId,
        updates.htmlContent,
        updates.metaTitle,
        updates.metaDescription,
        undefined,
        updates.metaFields ?? {},
      );
      const refreshed = (await HTMLPageService.getPage(
        pageId,
      )) as HtmlPageRecord;
      setPage(refreshed);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save page";
      setError(message);
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader>
          <div className="flex items-center w-full min-w-0 gap-0 p-0">
            <ChevronLeftTapButton
              href={backHref}
              ariaLabel="Back to published pages"
            />
            <h1 className="ml-2 text-sm font-medium text-foreground truncate">
              Loading…
            </h1>
          </div>
        </PageHeader>
        <div className="flex items-center justify-center h-full pt-12">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading page…</p>
          </div>
        </div>
      </>
    );
  }

  if (error && !page) {
    return (
      <>
        <PageHeader>
          <div className="flex items-center w-full min-w-0 gap-0 p-0">
            <ChevronLeftTapButton
              href={backHref}
              ariaLabel="Back to published pages"
            />
            <h1 className="ml-2 text-sm font-medium text-foreground truncate">
              Page not found
            </h1>
          </div>
        </PageHeader>
        <div className="flex items-center justify-center h-full pt-12">
          <div className="flex flex-col items-center gap-3 text-destructive">
            <AlertCircle className="h-8 w-8" />
            <p className="text-sm font-medium">Failed to load page</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchPage()}
              >
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(backHref)}
              >
                Back to list
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!page) return null;

  return (
    <div className="h-full overflow-hidden">
      <HtmlPageEditor
        page={page}
        isSaving={isSaving}
        error={error}
        onSave={handleSave}
        backHref={backHref}
        initialTab={initialTab}
        listReturnQuery={searchParams.get("ret") ?? undefined}
      />
    </div>
  );
}

export default function HtmlPageEditRoute() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full pt-12 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <HtmlPageEditBody />
    </Suspense>
  );
}
