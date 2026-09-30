// The old /rag/* family (before H6a, 2026-09-27), review-only. At c16b6616f9^
// every /rag/* route held the page code and /knowledge/* re-exported it, so the
// family had no page of its own beyond its twins. This map sends each old
// /rag/* address to its restored copy (or says where it still lives).

import Link from "next/link";
import { OldPageBanner } from "../_components/OldPageBanner";

const FAMILY: { path: string; what: string; href?: string; status: string }[] = [
  { path: "/rag", what: "Knowledge home", href: "/compare/old/knowledge-home", status: "Restored copy" },
  { path: "/rag/library", what: "Sources", href: "/compare/old/sources", status: "Restored copy" },
  { path: "/rag/search", what: "Search Lab", href: "/knowledge/search", status: "Live again — a kept user page" },
  { path: "/rag/visualization", what: "Graph demo (flow animation)", href: "/compare/old/graph-demo", status: "Restored copy" },
  { path: "/rag/data-stores", what: "Data stores", href: "/compare/old/data-stores", status: "Restored copy" },
  { path: "/rag/library-catalog", what: "Library catalog", href: "/compare/old/library-catalog", status: "Restored copy" },
  { path: "/rag/flow", what: "Pipeline flow", href: "/knowledge/flow", status: "Still live, unchanged" },
  { path: "/rag/repositories", what: "Repositories", href: "/knowledge/repositories", status: "Still live, unchanged" },
  { path: "/rag/admin", what: "Knowledge admin map", href: "/knowledge/admin", status: "Still live, unchanged" },
  { path: "/rag/viewer/[id], /rag/library/[id]/preview", what: "Document viewer", status: "Was already a redirect to the Source screen" },
];

export default function OldRagFamilyPage() {
  return (
    <div className="h-full overflow-auto bg-background pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-20 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">The old /rag pages</h1>
          <p className="text-sm text-muted-foreground">
            Every /rag address was a twin of a /knowledge page. Today each one redirects to its /knowledge twin.
          </p>
        </header>
        <ul className="divide-y rounded-md border text-sm">
          {FAMILY.map((f) => (
            <li key={f.path} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <code className="text-xs">{f.path}</code>
                <span className="ml-2">{f.what}</span>
              </div>
              {f.href ? (
                <Link href={f.href} className="text-xs text-primary underline underline-offset-2">
                  {f.status}
                </Link>
              ) : (
                <span className="text-xs text-muted-foreground">{f.status}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <OldPageBanner newHref="/knowledge" newLabel="the Knowledge hub" />
    </div>
  );
}
