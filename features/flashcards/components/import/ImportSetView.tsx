"use client";

// features/flashcards/components/import/ImportSetView.tsx
//
// Phase 1A (Flashcards Competitive Parity Push) — CSV / Quizlet-paste import.
// Paste or upload term/definition pairs, pick the field delimiter, preview the
// parsed rows (with a clear list of any skipped lines), then persist via the
// same `fcService.createSetWithCards` primitive the AI-generate flow uses.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  Loader2,
  ClipboardPaste,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fcService } from "../../data/fcService";
import {
  parseImportText,
  parsedRowsToCardInputs,
  type FieldDelimiter,
} from "../../utils/importExportCsv";

const EDU_BASE = "/education/flashcards";

const DELIMITER_OPTIONS: { value: FieldDelimiter; label: string }[] = [
  { value: "tab", label: "Tab (Quizlet default)" },
  { value: "comma", label: "Comma" },
  { value: "semicolon", label: "Semicolon" },
];

export function ImportSetView() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [setName, setSetName] = useState("");
  const [raw, setRaw] = useState("");
  const [delimiter, setDelimiter] = useState<FieldDelimiter>("tab");
  const [creating, setCreating] = useState(false);

  const busy = creating || isNavigating;
  const { rows, skipped } = parseImportText(raw, delimiter);
  const canSubmit = setName.trim().length > 0 && rows.length > 0 && !busy;

  const goBack = () => startNavigation(() => router.push(EDU_BASE));

  const handleFile = async (file: File) => {
    const text = await file.text();
    setRaw(text);
    // TSV/CSV file extension is a strong hint for the delimiter — but the
    // per-line fallback in parseImportText means a wrong guess still imports.
    if (file.name.toLowerCase().endsWith(".csv")) setDelimiter("comma");
    if (!setName.trim()) {
      setSetName(file.name.replace(/\.(csv|tsv|txt)$/i, ""));
    }
  };

  const handleCreate = async () => {
    if (!canSubmit) return;
    setCreating(true);
    try {
      const res = await fcService.createSetWithCards(
        { name: setName.trim() },
        parsedRowsToCardInputs(rows),
      );
      if (res.error || !res.data) {
        toast.error(res.error ?? "Could not create the flashcard set");
        return;
      }
      const { set, cards } = res.data;
      toast.success(
        `Imported "${set.name}" with ${cards.length} ${cards.length === 1 ? "card" : "cards"}`,
      );
      startNavigation(() => router.push(`${EDU_BASE}/${set.id}`));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={goBack}
            disabled={busy}
            aria-label="Back to flashcards"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Import a set
            </h1>
            <p className="text-sm text-muted-foreground">
              Paste or upload a CSV/TSV of term/definition pairs — including a
              Quizlet export.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-6">
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-name">
                Set name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="import-name"
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                placeholder="e.g. Spanish Unit 3 Vocabulary"
                className="text-base"
                disabled={busy}
                required
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="import-delimiter">Field delimiter</Label>
                <Select
                  value={delimiter}
                  onValueChange={(v) => setDelimiter(v as FieldDelimiter)}
                  disabled={busy}
                >
                  <SelectTrigger id="import-delimiter" className="text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIMITER_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-4 w-4" />
                  Upload file
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-text" className="flex items-center gap-1.5">
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste term/definition pairs — one card per line
              </Label>
              <Textarea
                id="import-text"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={"Mitochondria\tThe powerhouse of the cell\nPhotosynthesis\tThe process plants use to convert light into energy"}
                className="min-h-48 resize-y font-mono text-sm"
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                Copy directly from a Quizlet set&rsquo;s export, a spreadsheet
                column pair, or any tab/comma-separated list.
              </p>
            </div>

            {/* Preview */}
            {raw.trim() ? (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {rows.length} {rows.length === 1 ? "card" : "cards"} ready to import
                  </span>
                  {skipped.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {skipped.length} line{skipped.length === 1 ? "" : "s"} skipped
                    </span>
                  ) : null}
                </div>
                {rows.length > 0 ? (
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {rows.slice(0, 25).map((r) => (
                      <div
                        key={r.line}
                        className="grid grid-cols-2 gap-2 rounded border border-border/60 bg-card px-2 py-1 text-xs"
                      >
                        <span className="truncate text-foreground">{r.front}</span>
                        <span className="truncate text-muted-foreground">{r.back}</span>
                      </div>
                    ))}
                    {rows.length > 25 ? (
                      <p className="pt-1 text-center text-[11px] text-muted-foreground">
                        + {rows.length - 25} more
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {skipped.length > 0 ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Skipped lines had no usable delimiter or a blank field —
                    they were left out rather than guessed.
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={goBack} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {busy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileSpreadsheet className="mr-1.5 h-4 w-4" />
                )}
                {isNavigating ? "Opening…" : `Import ${rows.length || ""} cards`}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
