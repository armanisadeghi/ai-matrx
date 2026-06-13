"use client";

// DictionaryImportDialog — the advanced JSON/CSV import path for the dictionary
// manager. Parses (papaparse for CSV), previews the parsed entries + any skipped
// rows, then commits via the parent's onImport (a dedupe-by-term upsert). Offers
// a downloadable CSV template so users can fill it out and re-upload.

import { useCallback, useRef, useState } from "react";
import { Upload, FileDown, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  dictCsvTemplate,
  downloadTextFile,
  parseDictCsv,
  parseDictJson,
  type DictImportResult,
} from "@/features/dictionary/utils/io";
import type { DictEntryDraft } from "@/features/dictionary/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (drafts: DictEntryDraft[]) => Promise<void>;
}

export function DictionaryImportDialog({ open, onOpenChange, onImport }: Props) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [parsed, setParsed] = useState<DictImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setText("");
    setParsed(null);
    setParseError(null);
  }, []);

  const doParse = useCallback((raw: string, fmt: "csv" | "json") => {
    setParseError(null);
    if (!raw.trim()) {
      setParsed(null);
      return;
    }
    try {
      setParsed(fmt === "csv" ? parseDictCsv(raw) : parseDictJson(raw));
    } catch (e) {
      setParsed(null);
      setParseError((e as Error).message);
    }
  }, []);

  const onFile = useCallback(
    async (file: File) => {
      const raw = await file.text();
      const fmt = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
      setFormat(fmt);
      setText(raw);
      doParse(raw, fmt);
    },
    [doParse],
  );

  const commit = useCallback(async () => {
    if (!parsed || parsed.drafts.length === 0) return;
    setBusy(true);
    try {
      await onImport(parsed.drafts);
      toast.success(`Imported ${parsed.drafts.length} entr${parsed.drafts.length === 1 ? "y" : "ies"}`);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error("Import failed", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [parsed, onImport, reset, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import dictionary entries</DialogTitle>
          <DialogDescription>
            Paste or upload CSV or JSON. Entries merge by term — existing terms are updated.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> Choose file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => downloadTextFile("dictionary-template.csv", dictCsvTemplate(), "text/csv")}
          >
            <FileDown className="h-4 w-4" /> Download CSV template
          </Button>
          <div className="ml-auto inline-flex rounded-md border border-border p-0.5 text-xs">
            {(["csv", "json"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => { setFormat(f); doParse(text, f); }}
                className={`px-2 py-1 rounded ${format === f ? "bg-accent text-foreground" : "text-muted-foreground"}`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <Textarea
          value={text}
          onChange={(e) => { setText(e.target.value); doParse(e.target.value, format); }}
          placeholder={
            format === "csv"
              ? "term,sounds_like,pronunciation,ipa,definition,category,is_active"
              : '[{"term":"Rejuvina","pronunciation":"reh-juh-VEE-nah"}]'
          }
          className="min-h-[140px] font-mono text-xs"
          style={{ fontSize: "16px" }}
        />

        {parseError && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> {parseError}
          </p>
        )}

        {parsed && (
          <div className="rounded-md border border-border">
            <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-b border-border">
              <span>{parsed.drafts.length} entr{parsed.drafts.length === 1 ? "y" : "ies"} ready</span>
              {parsed.skipped.length > 0 && (
                <span className="text-amber-600">{parsed.skipped.length} row(s) skipped</span>
              )}
            </div>
            <ScrollArea className="max-h-48">
              <ul className="divide-y divide-border text-sm">
                {parsed.drafts.slice(0, 100).map((d, i) => (
                  <li key={i} className="px-3 py-1.5 flex items-center gap-2">
                    <span className="font-medium">{d.term}</span>
                    {d.pronunciation && (
                      <span className="text-xs text-muted-foreground">/{d.pronunciation}/</span>
                    )}
                    {d.category && (
                      <span className="ml-auto text-[11px] text-muted-foreground">{d.category}</span>
                    )}
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); onOpenChange(false); }} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={commit} disabled={busy || !parsed || parsed.drafts.length === 0}>
            {busy ? "Importing…" : `Import ${parsed?.drafts.length ?? 0}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
