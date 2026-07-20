"use client";

import { useState } from "react";
import Link from "next/link";
import { History, Loader2, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  usePageWorkspace,
  useUpdatePageIntent,
} from "@/features/marketing/data/hooks";
import type { MarketingPage } from "@/features/marketing/types";
import {
  displayScore,
  formatDate,
  JsonPreview,
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { MarketingUrlRow } from "@/features/marketing/components/shared/MarketingUrlRow";
import { SnapshotArtifacts } from "@/features/marketing/components/pages/SnapshotArtifacts";
import { extractErrorMessage } from "@/utils/errors";

function IntentForm({ page }: { page: MarketingPage }) {
  const mutation = useUpdatePageIntent();
  const [keyword, setKeyword] = useState(page.target_keyword ?? "");
  const [title, setTitle] = useState(page.meta_title_desired ?? "");
  const [description, setDescription] = useState(
    page.meta_description_desired ?? "",
  );
  const dirty =
    keyword !== (page.target_keyword ?? "") ||
    title !== (page.meta_title_desired ?? "") ||
    description !== (page.meta_description_desired ?? "");

  const save = async () => {
    try {
      await mutation.mutateAsync({
        siteId: page.site_id,
        pageId: page.id,
        expectedVersion: page.version,
        targetKeyword: keyword.trim() || null,
        desiredMetaTitle: title.trim() || null,
        desiredMetaDescription: description.trim() || null,
      });
      toast.success("Page intent saved");
    } catch (error) {
      toast.error("Could not save page intent", {
        description: extractErrorMessage(error),
      });
    }
  };

  return (
    <div className="grid gap-3 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="target-keyword" className="text-xs">
          Target keyword
        </Label>
        <Input
          id="target-keyword"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Primary search intent"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="desired-title" className="text-xs">
            Desired meta title
          </Label>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {title.length} characters
          </span>
        </div>
        <Input
          id="desired-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Editorial target, separate from observed content"
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="desired-description" className="text-xs">
            Desired meta description
          </Label>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {description.length} characters
          </span>
        </div>
        <Textarea
          id="desired-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minHeight={86}
          maxHeight={160}
          placeholder="Editorial target, separate from observed content"
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-8"
          disabled={!dirty || mutation.isPending}
          onClick={() => void save()}
        >
          {mutation.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-3.5 w-3.5" />
          )}
          Save intent
        </Button>
      </div>
    </div>
  );
}

export function PageWorkspace({ pageId }: { pageId: string }) {
  const { site, sitePath } = useMarketingSite();
  const workspace = usePageWorkspace(site.id, pageId);
  if (workspace.isLoading)
    return <LoadingSurface label="Loading canonical page…" />;
  if (workspace.isError || !workspace.data) {
    return (
      <QueryError
        error={workspace.error ?? new Error("Page not found")}
        onRetry={() => void workspace.refetch()}
      />
    );
  }
  const data = workspace.data;
  const page = data.page;
  const snapshot = data.latestSnapshot;

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <section className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <StatusBadge value={page.status} />
              <Badge variant="outline" className="uppercase">
                {page.provenance}
              </Badge>
            </div>
            <h1 className="mt-2 truncate font-mono text-sm font-semibold text-foreground">
              {page.path || "/"}
            </h1>
            <MarketingUrlRow url={page.url} className="mt-0.5" />
          </div>
          <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
            <Link
              href={`${sitePath}/pages/${page.id}/snapshots`}
            >
              <History className="mr-1.5 h-3.5 w-3.5" />
              Snapshot history
            </Link>
          </Button>
        </section>

        <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 lg:grid-cols-6">
          <MetricCell
            label="Latest score"
            value={displayScore(data.score)}
            detail={`${data.failCount} failing items`}
            tone={
              data.score !== null && data.score >= 80
                ? "good"
                : data.score === null
                  ? "default"
                  : "warning"
            }
          />
          <MetricCell
            label="Open findings"
            value={data.openFindings}
            detail="Current state"
            tone={data.openFindings ? "warning" : "good"}
          />
          <MetricCell
            label="Last HTTP"
            value={page.http_status_last ?? "—"}
            detail="Latest observed"
          />
          <MetricCell label="First seen" value={formatDate(page.first_seen)} />
          <MetricCell label="Last seen" value={formatDate(page.last_seen)} />
          <MetricCell
            label="Current content"
            value={snapshot ? "Captured" : "None"}
            detail={
              snapshot
                ? formatDate(snapshot.captured_at)
                : "No accepted snapshot"
            }
          />
        </section>

        <div className="grid gap-3 lg:grid-cols-[minmax(340px,0.8fr)_minmax(0,1.2fr)]">
          <SectionCard title="User-owned page intent">
            <IntentForm key={`${page.id}:${page.updated_at}`} page={page} />
          </SectionCard>

          <SectionCard
            title="Current observed snapshot"
            action={{
              label: "View timeline",
              href: `${sitePath}/pages/${page.id}/snapshots`,
            }}
          >
            {snapshot ? (
              <div className="grid gap-3 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Captured
                  </p>
                  <p className="mt-0.5 text-xs">
                    {formatDate(snapshot.captured_at)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    HTTP / words
                  </p>
                  <p className="mt-0.5 font-mono text-xs">
                    {snapshot.http_status ?? "—"} ·{" "}
                    {snapshot.word_count?.toLocaleString() ?? "—"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <SnapshotArtifacts
                    siteId={site.id}
                    snapshot={snapshot}
                    showMarkdown
                  />
                </div>
              </div>
            ) : (
              <p className="p-4 text-xs text-muted-foreground">
                This canonical URL exists independently, but no crawl has
                produced an accepted snapshot yet.
              </p>
            )}
          </SectionCard>
        </div>

        {snapshot ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <SectionCard title="Observed head tags">
              <JsonPreview value={snapshot.head_tags} />
            </SectionCard>
            <SectionCard title="Extracted content">
              <JsonPreview value={snapshot.extracted} />
            </SectionCard>
          </div>
        ) : null}
      </div>
    </main>
  );
}
