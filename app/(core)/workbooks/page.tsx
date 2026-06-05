"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Loader2,
  Plus,
  Trash,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/components/ui/use-toast";

import {
  createWorkbook,
  deleteWorkbook,
  listAccessibleWorkbooks,
} from "@/features/data-tables/workbook-service";
import { isServiceFailure, type Workbook } from "@/features/data-tables/types";

export default function WorkbooksLandingPage() {
  const router = useRouter();
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await listAccessibleWorkbooks();
    if (isServiceFailure(res)) {
      setError(res.error);
      setLoading(false);
      return;
    }
    setWorkbooks(res.data);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const res = await createWorkbook({ name: "Untitled workbook" });
    setCreating(false);
    if (isServiceFailure(res)) {
      toast({
        title: "Could not create workbook",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    router.push(`/workbooks/${res.data.id}`);
  }, [router]);

  const handleDelete = useCallback(
    async (wb: Workbook) => {
      const ok = await confirm({
        title: "Delete workbook?",
        description: `"${wb.workbook_name}" and all of its saved snapshots will be permanently removed.`,
        confirmLabel: "Delete",
        variant: "destructive",
      });
      if (!ok) return;
      const res = await deleteWorkbook(wb.id);
      if (isServiceFailure(res)) {
        toast({
          title: "Could not delete workbook",
          description: res.error,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Workbook deleted", variant: "success" });
      void reload();
    },
    [reload],
  );

  return (
    <div className="w-full h-page p-4 space-y-4 overflow-y-auto scrollbar-none">
      <div className="flex items-center justify-between pr-10">
        <div>
          <h1 className="text-2xl font-bold">Workbooks</h1>
          <p className="text-sm text-muted-foreground">
            Lossless spreadsheets — multi-sheet, formulas, formatting. Each
            workbook autosaves and syncs in realtime to anyone with access.
          </p>
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          New workbook
        </Button>
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

      {!loading && !error && workbooks.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <FileSpreadsheet className="size-8" />
            <div className="text-sm">No workbooks yet.</div>
            <div className="text-xs">
              Click <span className="font-medium">New workbook</span> to create
              one.
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && workbooks.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workbooks.map((wb) => (
            <Card key={wb.id} className="group">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    className="flex flex-1 items-start gap-2 text-left"
                    onClick={() => router.push(`/workbooks/${wb.id}`)}
                  >
                    <FileSpreadsheet className="size-5 mt-0.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {wb.workbook_name}
                      </div>
                      {wb.description && (
                        <div className="text-xs text-muted-foreground truncate">
                          {wb.description}
                        </div>
                      )}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
                    onClick={() => handleDelete(wb)}
                    title="Delete workbook"
                  >
                    <Trash className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Updated {new Date(wb.updated_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
