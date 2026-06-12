"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Trash } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/components/ui/use-toast";

import {
  createDocument,
  deleteDocument,
  listAccessibleDocuments,
} from "@/features/data-tables/document-service";
import { isServiceFailure, type DocumentRow } from "@/features/data-tables/types";

export default function DocumentsLandingPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="w-full h-page p-4 space-y-4 overflow-y-auto scrollbar-none">
      {/* Mobile: stack title + actions; expand to a single row at sm+. The
          right-side pr-10 reservation existed for a desktop side-drawer
          hit-area; on small screens it crushed the button row. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:pr-10">
        <h1 className="text-2xl font-bold">Documents</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={creating}
            title="New document"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">New document</span>
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
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
              Click <span className="font-medium">New document</span> to create
              one.
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && documents.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <Card key={doc.id} className="group">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="flex flex-1 items-start gap-2 text-left"
                    onClick={() => router.push(`/documents/${doc.id}`)}
                  >
                    <FileText className="size-5 mt-0.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {doc.document_name}
                      </div>
                      {doc.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {doc.description}
                        </div>
                      )}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
                    onClick={() => handleDelete(doc)}
                    title="Delete document"
                  >
                    <Trash className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(doc.updated_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
