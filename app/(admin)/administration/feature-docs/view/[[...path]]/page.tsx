import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, GitCommit } from "lucide-react";
import { createClient } from "@/utils/supabase/server";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import { formatAbsoluteDate } from "@/utils/datetime";
import type { FeatureDocDetail } from "@/features/feature-docs/service";

interface FeatureDocViewPageProps {
  params: Promise<{ path?: string[] }>;
}

async function loadDocByPath(
  relPath: string,
): Promise<FeatureDocDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("admin")
    .from("feature_docs")
    .select(
      "id, path, slug, title, area, content, content_hash, sync_base_hash, sync_base_commit, synced_at, updated_at, version, metadata",
    )
    .eq("path", relPath)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export default async function FeatureDocViewPage({
  params,
}: FeatureDocViewPageProps) {
  const { path: segments } = await params;
  if (!segments || segments.length === 0) {
    notFound();
  }

  const relPath = segments.map(decodeURIComponent).join("/");
  if (!relPath.endsWith(".md") && !relPath.endsWith(".MD")) {
    notFound();
  }

  const doc = await loadDocByPath(relPath);
  if (!doc) {
    notFound();
  }

  return (
    <div className="min-h-[calc(100dvh-var(--header-height))] bg-background flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-2 flex items-center gap-3 flex-wrap shrink-0">
        <Link
          href="/administration/feature-docs"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Feature docs
        </Link>
        <span className="text-xs text-muted-foreground">/</span>
        <span className="inline-flex items-center gap-1.5 text-xs font-mono min-w-0 truncate">
          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {relPath}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {doc.sync_base_commit && (
            <span className="inline-flex items-center gap-1 font-mono">
              <GitCommit className="h-3 w-3" />
              {doc.sync_base_commit.slice(0, 7)}
            </span>
          )}
          {doc.synced_at && (
            <span title={formatAbsoluteDate(doc.synced_at)}>
              synced {formatAbsoluteDate(doc.synced_at)}
            </span>
          )}
          <span>v{doc.version}</span>
        </div>
      </header>
      <main className="flex-1 overflow-y-auto px-6 py-6">
        {doc.title && (
          <h1 className="text-lg font-semibold mb-4 sr-only">{doc.title}</h1>
        )}
        <BasicMarkdownContent content={doc.content} />
      </main>
    </div>
  );
}
