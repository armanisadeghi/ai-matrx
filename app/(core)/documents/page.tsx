"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/components/ui/use-toast";
import {
  LoadingTapButton,
  PlusTapButton,
} from "@/components/icons/tap-buttons";
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

type HubViewMode = "cards" | "table";
const HUB_VIEW_STORAGE_KEY = "documents-hub-view";

export default function DocumentsLandingPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<DocumentSortKey>("updated");
  const [view, setView] = useState<HubViewMode>("cards");
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const saved = window.localStorage.getItem(HUB_VIEW_STORAGE_KEY);
    if (saved === "cards" || saved === "table") setView(saved);
  }, []);

  const setViewPersist = (mode: HubViewMode) => {
    setView(mode);
    window.localStorage.setItem(HUB_VIEW_STORAGE_KEY, mode);
  };

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
  const showHeaderCreate = !loading && !error && documents.length === 0;

  return (
    <div className="w-full h-page space-y-4 overflow-y-auto p-1.5 scrollbar-none">
      <div className="flex items-center pl-10 sm:pl-0 sm:pr-10">
        <h1 className="text-2xl font-bold">Matrx Document Hub</h1>
        {showHeaderCreate ? (
          creating ? (
            <LoadingTapButton ariaLabel="Creating document" disabled />
          ) : (
            <PlusTapButton
              ariaLabel="New document"
              tooltip="New document"
              onClick={handleCreate}
            />
          )
        ) : null}
      </div>

      {showToolbar ? (
        <>
          <DocumentsHubToolbar
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setViewPersist}
            sortKey={sortKey}
            onSortChange={setSortKey}
            creating={creating}
            onCreate={handleCreate}
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
              Tap <span className="font-medium">New document</span> to create
              one.
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
  );
}
