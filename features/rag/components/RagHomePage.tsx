"use client";

/**
 * /knowledge — Knowledge home.
 *
 * Landing page for the Knowledge / Knowledge area. The user said there was
 * no landing here, so this is the canonical entry point: a clean
 * dashboard that surfaces the live state across data stores, the
 * processed-document library, and search.
 *
 * The counts are the Sources page's own (`useSourcesCounts` →
 * `readSourcesCounts`, the read behind its Saved / All captures toggle), in
 * its words, each linking to the Sources page on that view — two screens can
 * never report two different libraries.
 */

import Link from "next/link";
import {
  ArrowRight,
  Bookmark,
  Database,
  FileText,
  Inbox,
  Search,
  Eye,
  CheckCircle2,
} from "lucide-react";
import { Skeleton } from "@ai-matrx/design-system";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";
import { useSourcesCounts } from "@/features/sources/hooks/useSources";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useLibraryCatalog } from "@/features/rag/hooks/useLibraryCatalog";
import { LibraryCatalogPane } from "@/features/rag/components/data-stores/LibraryCatalogPane";
import { EntitlementChip } from "@/features/rag/components/library-catalog/EntitlementChip";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { UntrustedCount } from "@/components/official/stale-data/UntrustedCount";

export function RagHomePage() {
  const userId = useAppSelector(selectUserId);
  // The Sources page opens on "Captured by Me"; the home counts that same view.
  const { savedTotal, allTotal, loading, failed } = useSourcesCounts(
    { kind: "mine" },
    userId,
  );

  // Entitled empty state — a user in an entitled org with zero personal
  // content must see their shared libraries FIRST, not an empty dashboard.
  const catalog = useLibraryCatalog();
  const entitledLibraries = catalog.items.filter(
    (it) => it.entitledVia != null,
  );
  const showEntitledHero =
    !loading &&
    !failed &&
    allTotal === 0 &&
    entitledLibraries.length > 0;

  return (
    <>
      <RagHubHeader />
      <div className="h-full overflow-auto bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
          {/* Entitled empty state — shared libraries lead when the user has no
            personal content of their own. */}
          {showEntitledHero && (
            <section className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Shared libraries you can read right now
              </h2>
              <p className="text-xs text-muted-foreground">
                You haven&apos;t added any documents of your own yet, but your
                organization is entitled to these curated knowledge libraries —
                open one, or search across them from the Search tab.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {entitledLibraries.map((it) => (
                  <Link
                    key={it.id}
                    href={`/knowledge/library-catalog?type=data_store&id=${it.id}`}
                    className="group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-primary/50"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {it.name}
                    </span>
                    <EntitlementChip
                      entitledVia={it.entitledVia}
                      industryName={it.entitledIndustryName}
                    />
                    <ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {/* Live numbers — the Sources page's own counts */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Your Sources right now
            </h2>
            {failed && (
              <ErrorNotice
                title="Your Source counts could not be read"
                message="Refresh to try again, or open Sources to see the list itself."
                operation="Count your Sources (Saved / All captures)"
                calls={["docproc.processed_documents"]}
              />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <StatCard
                label="Saved"
                hint="Sources you kept or uploaded"
                href="/knowledge/library?show=saved"
                // read-gate-exempt: StatCard renders this through UntrustedCount with trustworthy={savedTotal !== null}
                value={savedTotal}
                loading={loading}
                trustworthy={savedTotal !== null}
                icon={<Bookmark className="h-3.5 w-3.5 text-primary" />}
              />
              <StatCard
                label="All captures"
                hint="Everything captured, saved or not"
                href="/knowledge/library?show=all"
                // read-gate-exempt: StatCard renders this through UntrustedCount with trustworthy={allTotal !== null}
                value={allTotal}
                loading={loading}
                trustworthy={allTotal !== null}
                icon={<Inbox className="h-3.5 w-3.5" />}
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
                href="/knowledge/library"
                icon={<FileText className="h-5 w-5" />}
                title="Sources"
                description="Every file, web page, transcript, and pasted text you've added, with its stage and where it's attached. Add new ones here."
                cta="Open Sources"
              />
              <NavCard
                href="/knowledge/data-stores"
                icon={<Database className="h-5 w-5" />}
                title="Data Stores"
                description="Named, scoped collections of documents an agent can query. Bind documents here to make them retrievable."
                cta="Manage stores"
              />
              <NavCard
                href="/knowledge/search"
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
                <strong className="text-foreground">Add a Source:</strong> open{" "}
                <Link href="/knowledge/library" className="underline">
                  Sources
                </Link>{" "}
                → Add → Upload a file, Paste a web address, Paste text, or
                Import a transcript. It processes, segments, and embeds on its
                own; attach it to a data store to make it retrievable.
              </li>
              <li>
                <strong className="text-foreground">
                  See what processed correctly:
                </strong>{" "}
                open{" "}
                <Link href="/knowledge/library" className="underline">
                  Sources
                </Link>{" "}
                and read each row's stage — Searchable means an agent can
                retrieve it; anything else says what is still running or what
                went wrong.
              </li>
              <li>
                <strong className="text-foreground">Inspect a Source:</strong>{" "}
                click any row on Sources — its text,{" "}
                {RAG_VOCAB.segmentsShort.toLowerCase()}, and where it&apos;s
                attached are all there.
              </li>
              <li>
                <strong className="text-foreground">Test retrieval:</strong> use{" "}
                <Link href="/knowledge/search" className="underline">
                  Search
                </Link>{" "}
                with a data-store filter to see exactly what an agent would
                retrieve.
              </li>
            </ol>
          </section>

          {/* Shared knowledge libraries — opt-in catalog (Shared Knowledge Resources) */}
          <section className="space-y-3">
            <LibraryCatalogPane />
          </section>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  hint,
  href,
  value,
  loading,
  trustworthy,
  icon,
}: {
  label: string;
  hint: string;
  /** The Sources page on the view this number counts. */
  href: string;
  value: number | null;
  loading: boolean;
  /** False when the count read failed: the tile shows "—", never 0. */
  trustworthy: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-md border bg-muted/30 p-3 flex flex-col gap-1 transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wide">
        {icon}
        {label}
      </span>
      <span className="font-semibold text-xl tabular-nums">
        {loading ? (
          <Skeleton className="h-6 w-12" />
        ) : (
          <UntrustedCount
            value={(value ?? 0).toLocaleString()}
            trustworthy={trustworthy}
            label={label}
          />
        )}
      </span>
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        {hint}
        <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
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
