"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CmsPageService } from "@/features/cms/services/cmsService";
import type { ClientPageSummary } from "@/features/cms/types";
import { useSiteContext } from "./SiteLayoutClient";
import PageListView from "../../../../features/cms/components/PageListView";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Puzzle } from "lucide-react";

export default function SiteDashboardPage() {
  const { siteId } = useParams() as { siteId: string };
  const router = useRouter();
  const { site } = useSiteContext();
  const [pages, setPages] = useState<ClientPageSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPages = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await CmsPageService.listPages(siteId);
      setPages(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const handleDeletePage = async (pageId: string) => {
    try {
      await CmsPageService.deletePage(pageId);
      setPages((prev) => prev.filter((p) => p.id !== pageId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Sub-header with site actions ─────────────────────── */}
      <div className="flex-none flex items-center justify-between px-4 sm:px-6 py-2 border-b border-border/30 bg-muted/10">
        <div className="flex items-center gap-2">
          <Link href={`/cms/${siteId}/settings`}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7">
              <Settings className="h-3.5 w-3.5" />
              Settings
            </Button>
          </Link>
          <Link href={`/cms/${siteId}/components`}>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7">
              <Puzzle className="h-3.5 w-3.5" />
              Components
            </Button>
          </Link>
        </div>
        <Link href={`/cms/${siteId}/pages/new`}>
          <Button size="sm" className="gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New Page
          </Button>
        </Link>
      </div>

      {/* ── Page list ────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <PageListView
          pages={pages}
          isLoading={isLoading}
          error={error}
          onOpenPage={(pageId) => router.push(`/cms/${siteId}/pages/${pageId}`)}
          onDeletePage={handleDeletePage}
          onRefresh={fetchPages}
        />
      </div>
    </div>
  );
}
