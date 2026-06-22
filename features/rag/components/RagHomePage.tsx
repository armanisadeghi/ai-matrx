"use client";

/**
 * /rag — Knowledge home.
 *
 * Landing page for the RAG / Knowledge area. The user said there was
 * no landing here, so this is the canonical entry point: a clean
 * dashboard that surfaces the live state across data stores, the
 * processed-document library, and search.
 *
 * Pulls from /rag/library/summary/totals (already-implemented endpoint)
 * so users see "is anything happening?" without clicking through.
 */

import Link from "next/link";
import {
  ArrowRight,
  Database,
  FileText,
  Layers,
  Search,
  Zap,
  Eye,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useLibrarySummary } from "@/features/rag/hooks/useLibrary";

export function RagHomePage() {
  const { summary, loading, error } = useLibrarySummary();

  return (
    <div className="flex-1 bg-background overflow-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Header */}
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Knowledge</h1>
          <p className="text-muted-foreground max-w-2xl">
            Your processed documents, data stores, and retrieval surface. Upload
            a document, bind it to a data store, and any agent scoped to that
            store can search it.
          </p>
        </header>

        {/* Live numbers */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            What's in your library right now
          </h2>
          {error && (
            <div className="border border-destructive/50 bg-destructive/5 rounded-md p-3 text-sm text-destructive">
              <strong>Could not load summary:</strong> {error}
              <p className="text-xs mt-1 text-muted-foreground">
                The endpoint is /rag/library/summary/totals. If you just
                deployed, give the backend a minute to restart, then refresh.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <StatCard
              label="Documents"
              value={summary?.documentsTotal}
              loading={loading}
              icon={<FileText className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Ready"
              value={summary?.documentsReady}
              loading={loading}
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
              tone="success"
            />
            <StatCard
              label="Embedding"
              value={summary?.documentsEmbedding}
              loading={loading}
              icon={<Zap className="h-3.5 w-3.5 text-blue-500" />}
            />
            <StatCard
              label="Extracted"
              value={summary?.documentsExtracted}
              loading={loading}
              icon={<AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />}
              tone="warning"
            />
            <StatCard
              label="Pending / failed"
              value={summary?.documentsPending}
              loading={loading}
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              tone="error"
            />
            <StatCard
              label={`Total ${RAG_VOCAB.segmentsShort.toLowerCase()}`}
              value={summary?.chunks}
              loading={loading}
              icon={<Layers className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Data stores"
              value={summary?.dataStores}
              loading={loading}
              icon={<Database className="h-3.5 w-3.5" />}
            />
          </div>
        </section>

        {/* Quick links */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Surfaces
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <NavCard
              href="/rag/library"
              icon={<FileText className="h-5 w-5" />}
              title="Library"
              description={`Every document you've processed, with status, page counts, ${RAG_VOCAB.segmentsShort.toLowerCase()}, embeddings, and which data stores they're bound to.`}
              cta="Open library"
            />
            <NavCard
              href="/rag/data-stores"
              icon={<Database className="h-5 w-5" />}
              title="Data Stores"
              description="Named, scoped collections of documents an agent can query. Bind documents here to make them retrievable."
              cta="Manage stores"
            />
            <NavCard
              href="/rag/search"
              icon={<Search className="h-5 w-5" />}
              title="Search"
              description="Hybrid retrieval (vector + lexical, with optional rerank) across your indexed content. Useful for testing what an agent will see."
              cta="Run a search"
            />
          </div>
        </section>

        {/* Help block — what to do when */}
        <section className="border rounded-md bg-muted/20 p-4">
          <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
            <Eye className="h-4 w-4" />
            Common workflows
          </h3>
          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal pl-5">
            <li>
              <strong className="text-foreground">Add a document:</strong> go to{" "}
              <Link href="/rag/data-stores" className="underline">
                Data Stores
              </Link>{" "}
              → drag a PDF onto a store → it uploads, processes, segments,
              embeds, and binds in one step.
            </li>
            <li>
              <strong className="text-foreground">
                See what processed correctly:
              </strong>{" "}
              open the{" "}
              <Link href="/rag/library" className="underline">
                Library
              </Link>{" "}
              and look at the status badge — Ready means it's fully searchable;
              Extracted / Pending means it stalled.
            </li>
            <li>
              <strong className="text-foreground">Inspect a document:</strong>{" "}
              click any row in the library — pages,{" "}
              {RAG_VOCAB.segmentsShort.toLowerCase()}, embeddings, and
              store-bindings are all there.
            </li>
            <li>
              <strong className="text-foreground">Test retrieval:</strong> use{" "}
              <Link href="/rag/search" className="underline">
                Search
              </Link>{" "}
              with a data-store filter to see exactly what an agent would
              retrieve.
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  icon,
  tone,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  icon: React.ReactNode;
  tone?: "success" | "warning" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "border-green-500/30 bg-green-500/5"
      : tone === "warning"
        ? "border-yellow-500/30 bg-yellow-500/5"
        : tone === "error"
          ? "border-red-500/30 bg-red-500/5"
          : "bg-muted/30";
  return (
    <div className={`rounded-md border p-3 flex flex-col gap-1 ${toneClass}`}>
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-xl tabular-nums">
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          (value ?? 0).toLocaleString()
        )}
      </span>
    </div>
  );
}

function NavCard({
  href,
  icon,
  title,
  description,
  cta,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group border rounded-md p-4 hover:border-primary/50 hover:bg-accent/40 transition-colors flex flex-col gap-2"
    >
      <div className="flex items-center gap-2 text-foreground">
        <span className="text-primary">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      <p className="text-sm text-muted-foreground flex-1">{description}</p>
      <span className="text-xs font-medium text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
        {cta}
        <ArrowRight className="h-3 w-3" />
      </span>
    </Link>
  );
}
