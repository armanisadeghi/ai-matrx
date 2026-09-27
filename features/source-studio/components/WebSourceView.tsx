"use client";

/**
 * A web Source (`scrape_parsed_page` / `web_page`, any client — the scraper,
 * the extension, an agent, a crawl) shown in the scraper's OWN result screen
 * (`features/scraper/parts/core/PageContent`): Pretty, Reader, Organized,
 * Structured, Images, Text, Metadata, SEO, headers, the analysis tabs, the
 * JSON. Its sections are an outline inside that content — never a rail of
 * "pages" (Arman, 2026-09-27: the slide-show rail was "completely useless").
 *
 * Reads: the stored original (S3, gzip) and `structured_json` straight from
 * what the Source holds; the sections come from the caller's portions read.
 * One adapter turns them into the scraper's envelope (`webSourceAdapter`).
 */

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { fetchFileBlob } from "@/features/files/hooks/useFileBlob";
import { rememberFileOrganization } from "@/features/files/api/fileOrganization";
import PageContent from "@/features/scraper/parts/core/PageContent";
import ScraperDataUtils from "@/features/scraper/utils/data-utils";
import { ScrapeProvenance } from "@/features/scraper/parts/ScrapeProvenance";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  webSourcePageData,
  webSourceToScrape,
  type WebSection,
} from "@/features/source-studio/webSourceAdapter";
import { gunzipIfNeeded } from "./OriginalPane";

interface WebPayload {
  original: string | null;
  structured: unknown;
  capturedByRung: string | null;
  capturedAt: string | null;
  /** A sentence when the stored original could not be opened (the text still shows). */
  originalError: string | null;
}

function useWebPayload(
  documentId: string,
  originalFileId: string | null,
  organizationId: string,
) {
  const [state, setState] = useState<{ forKey: string | null; payload: WebPayload | null; error: string | null }>(
    { forKey: null, payload: null, error: null },
  );
  const key = `${documentId}:${originalFileId}`;
  useEffect(() => {
    let cancelled = false;
    // The stored original belongs to the Source's organization — read it
    // there, whatever organization the picker currently shows.
    if (originalFileId) rememberFileOrganization(originalFileId, organizationId);
    void (async () => {
      const [row, original] = await Promise.all([
        supabase
          .schema("docproc")
          .from("processed_documents")
          .select("structured_json,metadata,captured_at")
          .eq("id", documentId)
          .maybeSingle(),
        originalFileId
          ? fetchFileBlob(originalFileId)
              .then(gunzipIfNeeded)
              .then((text) => ({ text, error: null as string | null }))
              .catch((err: unknown) => ({
                text: null,
                error: `The stored copy of this page could not be opened (${
                  err instanceof Error ? err.message : String(err)
                }), so what is shown comes from the Source's saved text.`,
              }))
          : Promise.resolve({ text: null, error: null }),
      ]);
      if (cancelled) return;
      if (row.error) {
        setState({
          forKey: key,
          payload: null,
          error: `This page's details could not be read: ${row.error.message}`,
        });
        return;
      }
      const data = (row.data ?? {}) as {
        structured_json?: unknown;
        metadata?: Record<string, unknown> | null;
        captured_at?: string | null;
      };
      const meta = data.metadata ?? {};
      setState({
        forKey: key,
        error: null,
        payload: {
          original: original.text,
          originalError: original.error,
          structured: data.structured_json ?? null,
          capturedByRung:
            typeof meta.captured_by_rung === "string" ? meta.captured_by_rung : null,
          capturedAt:
            data.captured_at ??
            (typeof meta.captured_at === "string" ? meta.captured_at : null),
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, originalFileId, organizationId, key]);
  const settled = state.forKey === key;
  return {
    payload: settled ? state.payload : null,
    error: settled ? state.error : null,
    loading: !settled,
  };
}

export interface WebSourceViewProps {
  documentId: string;
  originalFileId: string | null;
  organizationId: string;
  name: string;
  url: string | null;
  sections: WebSection[];
  sectionsLoading: boolean;
  sectionsError: string | null;
}

export function WebSourceView({
  documentId,
  originalFileId,
  organizationId,
  name,
  url,
  sections,
  sectionsLoading,
  sectionsError,
}: WebSourceViewProps) {
  const read = useWebPayload(documentId, originalFileId, organizationId);
  const [activeTab, setActiveTab] = useState("pretty");

  if (read.loading || sectionsLoading) {
    return (
      <div className="space-y-3 p-4" data-testid="web-source-loading">
        <div className="h-6 w-1/3 animate-pulse rounded bg-muted/60" />
        <div className="h-8 w-full animate-pulse rounded bg-muted/50" />
        <div className="h-64 w-full animate-pulse rounded bg-muted/40" />
      </div>
    );
  }
  if (read.error || !read.payload) {
    const message = read.error ?? "This page's details could not be read.";
    return (
      <p className="m-4 text-sm text-destructive">
        {message} <ErrorAlchemyMenu error={message} />
      </p>
    );
  }

  const view = webSourceToScrape({
    name,
    url,
    capturedAt: read.payload.capturedAt,
    original: read.payload.original,
    structured: read.payload.structured,
    sections,
    capturedByRung: read.payload.capturedByRung,
  });
  const pageData = webSourcePageData(view);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="web-source-view" data-shape={view.shape}>
      {(read.payload.originalError || sectionsError || view.engine) && (
        <div className="shrink-0 space-y-1 px-4 pt-2 text-xs">
          <ScrapeProvenance engine={view.engine} escalated={null} escalationReason={null} />
          {read.payload.originalError && (
            <p className="text-warning">
              {read.payload.originalError}
              <ErrorAlchemyMenu error={read.payload.originalError} />
            </p>
          )}
          {sectionsError && (
            <p className="text-warning">
              {sectionsError}
              <ErrorAlchemyMenu error={sectionsError} />
            </p>
          )}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-hidden">
        <PageContent
          pageData={pageData}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          dataUtils={ScraperDataUtils}
        />
      </div>
    </div>
  );
}
