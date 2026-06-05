"use client";

import { useEffect, useState, use } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  getWorkbook,
  renameWorkbook,
} from "@/features/data-tables/workbook-service";
import { isServiceFailure, type Workbook } from "@/features/data-tables/types";

// Univer hard-depends on `window` / `document`. Mount client-only.
const WorkbookEditor = dynamic(
  () => import("@/features/data-tables/components/WorkbookEditor"),
  { ssr: false, loading: () => <EditorBootSpinner /> },
);

function EditorBootSpinner() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="size-4 animate-spin mr-2" />
      Loading editor…
    </div>
  );
}

export default function WorkbookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getWorkbook(id);
      if (isServiceFailure(res)) {
        setError(res.error);
        return;
      }
      setWorkbook(res.data);
      setRenameDraft(res.data.workbook_name);
    })();
  }, [id]);

  const commitRename = async () => {
    if (!workbook || renameDraft === workbook.workbook_name) return;
    setRenameSaving(true);
    const res = await renameWorkbook(id, renameDraft);
    setRenameSaving(false);
    if (!isServiceFailure(res)) {
      setWorkbook(res.data);
    } else {
      setRenameDraft(workbook.workbook_name);
    }
  };

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
        <div className="text-destructive">Could not load workbook.</div>
        <div className="text-muted-foreground">{error}</div>
        <Button variant="outline" size="sm" asChild>
          <a href="/workbooks">Back to workbooks</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-page w-full flex-col p-3">
      <div className="flex items-center gap-2 pb-2">
        <Button variant="ghost" size="icon" asChild>
          <a href="/workbooks" aria-label="Back to workbooks">
            <ArrowLeft className="size-4" />
          </a>
        </Button>
        <Input
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape" && workbook) {
              setRenameDraft(workbook.workbook_name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-8 max-w-md text-base font-semibold"
          disabled={!workbook}
          placeholder="Workbook name"
        />
        {renameSaving && (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        <WorkbookEditor workbookId={id} />
      </div>
    </div>
  );
}
