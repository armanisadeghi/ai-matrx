"use client";

/**
 * Kind Registry page shell — /administration/kind-registry.
 *
 * ONE page, three tabs over ONE server-side shape-doctor run:
 *  - Catalog (default): the canonical MatrxDataTable of every kind — sort /
 *    filter / sticky header / facets; row click → the per-kind detail page.
 *  - Board: the live shape-doctor matrix diffed against the committed
 *    snapshot (red findings, drift banners) — unchanged capability.
 *  - Schema Export: browse compiled + DB kinds, the uses/used-by reference
 *    graph, and provider-ready JSON Schema export with $defs — unchanged
 *    capability (code-split; ajv/editor stack stays out of the default tab).
 *
 * This replaced the old split-brain layout (doctor matrix stacked on top of a
 * second list+viewer system on one scroll) on 2026-07-17.
 */

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Boxes, CircleAlert, Hammer, Loader2 } from "lucide-react";
import type { KindStatusBoardModel } from "@/features/content-ir/admin/kind-detail-types";
import KindStatusBoard from "@/features/content-ir/admin/KindStatusBoard";
import KindCatalogTable from "@/features/content-ir/admin/KindCatalogTable";

const KindSchemaExplorer = dynamic(
  () => import("@/features/content-ir/admin/KindRegistryAdminClient"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading schema explorer</span>
      </div>
    ),
  },
);

const TABS = ["catalog", "board", "export"] as const;
type TabId = (typeof TABS)[number];
const TAB_LABELS: Record<TabId, string> = {
  catalog: "Catalog",
  board: "Board",
  export: "Schema Export",
};

function isTabId(value: string | undefined): value is TabId {
  return TABS.includes(value as TabId);
}

interface KindRegistryPageClientProps {
  board: KindStatusBoardModel | null;
  /** Loud shape-doctor failure — shown instead of a fabricated table/matrix. */
  boardError: string | null;
  initialTab?: string;
}

export default function KindRegistryPageClient({
  board,
  boardError,
  initialTab,
}: KindRegistryPageClientProps) {
  const [tab, setTab] = useState<TabId>(
    isTabId(initialTab) ? initialTab : "catalog",
  );

  function selectTab(next: TabId) {
    setTab(next);
    // Deep-linkable tabs without a navigation.
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  const doctorError = boardError && (
    <div className="flex items-center gap-2 border-b border-red-500/30 bg-red-500/5 px-4 py-2 text-sm text-red-700 dark:text-red-300">
      <CircleAlert className="h-4 w-4 shrink-0" />
      <span className="font-semibold">Shape doctor failed to run:</span>
      <span className="font-mono text-xs">{boardError}</span>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden bg-textured">
      {/* Header + tabs */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-card px-4 pr-14 pt-2">
        <h1 className="flex items-center gap-2 pb-2 text-base font-semibold text-foreground">
          <Boxes className="h-4 w-4 text-sky-500" />
          Kind Registry
        </h1>
        {board && (
          <span className="pb-2 text-xs text-muted-foreground">
            {board.totals.kinds} kinds ·{" "}
            {board.rows.filter((r) => r.isActive).length} active ·{" "}
            {board.redFindings.length} red · {board.yellowFindingCount} yellow
            {board.driftedRowCount > 0
              ? ` · ${board.driftedRowCount} drifted`
              : ""}
          </span>
        )}
        <nav className="ml-auto flex items-end gap-1">
          <Link
            href="/administration/kind-registry/build"
            className="mb-0.5 mr-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Hammer className="h-4 w-4" />
            Build a kind
          </Link>
          {TABS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={`border-b-2 px-3 py-1.5 text-sm transition-colors ${
                tab === id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="min-h-0 flex-1 overflow-hidden">
        {tab === "catalog" && (
          <div className="flex h-full flex-col p-3">
            {doctorError}
            {board ? (
              <KindCatalogTable rows={board.rows} />
            ) : !boardError ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Running shape doctor</span>
              </div>
            ) : null}
          </div>
        )}
        {tab === "board" && (
          <div className="h-full overflow-y-auto">
            {doctorError}
            {board && <KindStatusBoard board={board} />}
          </div>
        )}
        {tab === "export" && (
          <div className="h-full overflow-hidden">
            <KindSchemaExplorer />
          </div>
        )}
      </main>
    </div>
  );
}
