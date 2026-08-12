"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/components/ui/use-toast";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { TapTargetButtonSolid } from "@/components/icons/TapTargetButton";
import { DocumentListCard } from "@/features/data-tables/components/DocumentListCard";
import { DocumentsHubTable } from "@/features/data-tables/components/DocumentsHubTable";
import { DocumentsHubToolbar } from "@/features/data-tables/components/DocumentsHubToolbar";
import {
  createDocument,
  deleteDocument,
  listAccessibleDocuments,
} from "@/features/data-tables/document-service";
import {
  isServiceFailure,
  type DocumentRow,
} from "@/features/data-tables/types";
import {
  documentMatchesQuery,
  sortDocuments,
  type DocumentSortKey,
} from "@/features/data-tables/utils/documentsHubDisplay";
import {
  buildDocumentsLibraryContextData,
  DOCUMENTS_SURFACE_NAME,
} from "@/features/data-tables/agent-context/buildDocumentsContextData";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { captureDomSelection } from "@/features/context-menu-v3/utils/selection-tracking";
import {
  useListViewPrefs,
  type LegacyListViewImport,
} from "@/lib/list-views/useListViewPrefs";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";

/**
 * Style prefs for this hub (synced across devices via `userPreferences`).
 * Cards-first is this hub's own default — the platform default is table.
 */
const DOCUMENTS_HUB_VIEW_DEFAULTS: Partial<ListViewPrefs> = { view: "cards" };

/** One-time adoption of the device-local key this hub used before the hook. */
const DOCUMENTS_HUB_LEGACY_VIEW: LegacyListViewImport = {
  key: "documents-hub-view",
  map: (raw) => (raw === "table" || raw === "cards" ? { view: raw } : null),
};

export default function DocumentsLandingPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<DocumentSortKey>("updated");
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { prefs, setView } = useListViewPrefs(
    "documents-hub",
    DOCUMENTS_HUB_VIEW_DEFAULTS,
    DOCUMENTS_HUB_LEGACY_VIEW,
  );
  // This hub renders two of the three canonical views; anything else is cards.
  const view = prefs.view === "table" ? "table" : "cards";

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listAccessibleDocuments();
    if (isServiceFailure(res)) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setDocuments(res.data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const res = await createDocument({ name: "Untitled document" });
    setCreating(false);
    if (isServiceFailure(res)) {
      toast({
        title: "Could not create document",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    router.push(`/documents/${res.data.id}`);
  }, [router]);

  const handleDelete = useCallback(
    async (doc: DocumentRow) => {
      const ok = await confirm({
        title: "Delete document?",
        description: `"${doc.document_name}" and all of its saved snapshots will be permanently removed.`,
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;
      const res = await deleteDocument(doc.id);
      if (isServiceFailure(res)) {
        toast({
          title: "Could not delete document",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Document deleted", variant: "success" });
      void reload();
    },
    [reload],
  );

  const isAnyNavigating = navigatingId != null || isPending;

  const handleNavigate = useCallback(
    (id: string, path: string) => {
      if (isAnyNavigating) return;
      setNavigatingId(id);
      startTransition(() => {
        router.push(path);
      });
    },
    [isAnyNavigating, router],
  );

  const filteredDocuments = useMemo(() => {
    const filtered = documents.filter((doc) =>
      documentMatchesQuery(doc, query),
    );
    return sortDocuments(filtered, sortKey);
  }, [documents, query, sortKey]);

  const isSearching = query.trim().length > 0;
  const totalVisible = filteredDocuments.length;
  const showToolbar = !loading && !error && documents.length > 0;

  // ---- Agent-context surface (matrx-user/documents, library view) ---------
  // Plain function (React Compiler memoizes; never useCallback) so it reads
  // the live list state at Run time rather than a stale closure.
  //
  // This mount registers NO write handlers, on purpose. The surface HAS
  // agent-writable targets, but both of them address a single open document,
  // and a write target carries one value with no entity selector — on a roster
  // of N documents "set the description" has no subject. The only mutations
  // this route offers are create (a creation action, not a field write),
  // import (needs a `File` an agent cannot supply) and delete (destructive,
  // human-only), so read-only is the correct posture here rather than an
  // oversight. `listAgentWritableTargets()` offers a target only where its
  // mount registered a handler, so the document route's targets stay invisible
  // from the library. See the `writeTargets` doc block in
  // features/surfaces/manifests/documents.manifest.ts.
  const getLibraryScope = () => {
    const captured = captureDomSelection();
    return buildApplicationScopeFromMenuContext({
      selectedText: captured.text,
      selectionRange: null,
      contextData: buildDocumentsLibraryContextData({
        documents,
        visibleDocuments: filteredDocuments,
        searchQuery: query,
        sortKey,
        viewMode: view,
        loading,
        error,
      }),
    });
  };

  return (
    <SurfaceRuntimeProvider
      surfaceName={DOCUMENTS_SURFACE_NAME}
      getScope={getLibraryScope}
      isEditable={false}
    >
      <RouteHeader
        left={
          <span className="px-1.5 text-sm font-medium text-foreground">
            Documents
          </span>
        }
        right={
          <TapTargetButtonSolid
            icon={<Plus className="h-4 w-4" />}
            label="New document"
            onClick={handleCreate}
            disabled={creating}
          />
        }
      />
      <div className="h-full overflow-y-auto scrollbar-none">
        {/* The search/sort toolbar is the first thing in the scroll area, so
            the content takes header clearance — otherwise it sits under the
            glass header and collides with the title and the New button. */}
        <div className="w-full space-y-4 p-1.5 pt-[var(--shell-header-h)]">
          {showToolbar ? (
            <>
              <DocumentsHubToolbar
                query={query}
                onQueryChange={setQuery}
                view={view}
                onViewChange={setView}
                sortKey={sortKey}
                onSortChange={setSortKey}
              />

              {isSearching ? (
                <p className="px-1 text-[11px] tabular-nums text-muted-foreground">
                  {totalVisible === documents.length
                    ? `${totalVisible} documents`
                    : `${totalVisible} of ${documents.length} documents`}
                </p>
              ) : null}
            </>
          ) : null}

          {loading && (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading…
            </div>
          )}

          {error && !loading && (
            <Card>
              <CardContent className="p-4 text-sm text-destructive">
                {error}
              </CardContent>
            </Card>
          )}

          {!loading && !error && documents.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                <FileText className="size-8" />
                <div className="text-sm">No documents yet.</div>
                <div className="text-xs">
                  Tap <span className="font-medium">New document</span> to
                  create one.
                </div>
              </CardContent>
            </Card>
          )}

          {!loading &&
          !error &&
          documents.length > 0 &&
          isSearching &&
          totalVisible === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <Search className="mb-3 h-8 w-8 opacity-40" />
              <p className="text-sm">Nothing matches your search.</p>
            </div>
          ) : null}

          {!loading && !error && documents.length > 0 && totalVisible > 0 ? (
            view === "table" ? (
              <DocumentsHubTable
                documents={filteredDocuments}
                onDelete={handleDelete}
              />
            ) : (
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filteredDocuments.map((doc) => (
                  <DocumentListCard
                    key={doc.id}
                    doc={doc}
                    isNavigating={navigatingId === doc.id}
                    isAnyNavigating={isAnyNavigating}
                    onNavigate={handleNavigate}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </SurfaceRuntimeProvider>
  );
}
