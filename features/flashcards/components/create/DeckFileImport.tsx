"use client";

// features/flashcards/components/create/DeckFileImport.tsx
//
// "Import a deck file" — the no-AI path on the Create deck page. Bring a deck
// in exactly as it is: a Quizlet export, CSV / TSV, pasted term–definition
// pairs, Anki (.apkg, or Anki's own text export), a Matrx JSON export, or a
// whole-library .zip. Delimited text is previewed (with every skipped line
// named) before anything is saved; every file lands through THE one import
// entry `persistImportedDeck` (IC-11, features/education/onboard/import).
//
// Moved here from the old `/education/flashcards/new/import` page
// (ImportSetView) when that page became one tile of Create deck.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ClipboardPaste,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { recordToast, toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  importLibraryJson,
  importLibraryZip,
  importPortableJson,
  looksLikeLibraryJson,
  persistImportedDeck,
  type ImportOutcome,
} from "@/features/education/onboard/import/importDeck";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  parseCsvRecords,
  parseImportText,
  parsedRowsToCardInputs,
  type FieldDelimiter,
  type ParseImportResult,
} from "../../utils/importExportCsv";

const EDU_BASE = "/education/flashcards";

const DELIMITER_OPTIONS: { value: FieldDelimiter; label: string }[] = [
  { value: "tab", label: "Tab (Quizlet and Anki text exports)" },
  { value: "comma", label: "Comma" },
  { value: "semicolon", label: "Semicolon" },
];

/** Filename check only — the Anki decoder (zip + SQLite) loads on demand. */
const isAnkiFile = (file: File) => /\.(apkg|colpkg)$/i.test(file.name);

export function DeckFileImport() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [setName, setSetName] = useState("");
  const [raw, setRaw] = useState("");
  const [delimiter, setDelimiter] = useState<FieldDelimiter>("tab");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the text came from a CSV FILE: quote-aware RFC-4180 parse.
  // Cleared the moment the person edits the text.
  const [csvRows, setCsvRows] = useState<ParseImportResult | null>(null);

  const busy = creating || isNavigating;
  const { rows, skipped } = csvRows ?? parseImportText(raw, delimiter);
  const canSubmit = setName.trim().length > 0 && rows.length > 0 && !busy;

  const openDeck = (outcome: ImportOutcome) => {
    recordToast.success(
      { type: "flashcard_set", id: outcome.setId, title: outcome.name },
      `Imported "${outcome.name}" with ${outcome.cardCount} ${outcome.cardCount === 1 ? "card" : "cards"}${
        outcome.skipped ? ` (${outcome.skipped} skipped)` : ""
      }`,
    );
    startNavigation(() => router.push(`${EDU_BASE}/${outcome.setId}`));
  };

  /** A whole file that lands on its own (Anki, JSON, a library). */
  const landFile = async (run: () => Promise<void>) => {
    setCreating(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      const message = e instanceof Error ? e.message : "The file could not be imported.";
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  };

  const handleFile = async (file: File) => {
    if (isAnkiFile(file)) {
      return landFile(async () => {
        const { importAnkiFile } = await import(
          "@/features/education/onboard/import/importAnki"
        );
        openDeck(await importAnkiFile(file));
      });
    }
    if (/\.zip$/i.test(file.name)) {
      return landFile(async () => {
        const outcome = await importLibraryZip(file);
        const first = outcome.decks[0];
        toast.success(
          `Imported ${outcome.decks.length} deck${outcome.decks.length === 1 ? "" : "s"}${
            outcome.failed.length ? ` — ${outcome.failed.length} could not be read` : ""
          }`,
        );
        if (first) startNavigation(() => router.push(`${EDU_BASE}/${first.setId}`));
      });
    }
    const text = await file.text();
    if (/\.json$/i.test(file.name) || text.trimStart().startsWith("{")) {
      return landFile(async () => {
        if (looksLikeLibraryJson(text)) {
          const outcome = await importLibraryJson(text);
          toast.success(`Imported ${outcome.decks.length} decks`);
          startNavigation(() => router.push(EDU_BASE));
          return;
        }
        openDeck(await importPortableJson(text));
      });
    }
    // Delimited text: show it and its preview first — nothing is saved yet.
    setError(null);
    setRaw(text);
    if (file.name.toLowerCase().endsWith(".csv")) {
      setDelimiter("comma");
      setCsvRows(parseCsvRecords(text));
    } else {
      setDelimiter(/\t/.test(text) ? "tab" : text.includes(";") ? "semicolon" : "comma");
      setCsvRows(null);
    }
    if (!setName.trim()) {
      setSetName(file.name.replace(/\.(csv|tsv|txt)$/i, ""));
    }
  };

  const handleCreate = async () => {
    if (!canSubmit) return;
    await landFile(async () => {
      // IC-11: every import lands through the ONE entry, never the raw writer.
      openDeck(
        await persistImportedDeck({
          name: setName.trim(),
          cards: parsedRowsToCardInputs(rows),
          format: "delimited",
          skippedLines: skipped,
        }),
      );
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void handleCreate();
      }}
    >
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-6 text-center"
      >
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-foreground">Drop a deck file here, or</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".apkg,.colpkg,.csv,.tsv,.txt,.json,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="h-11 sm:h-9"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {creating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Choose a file
        </Button>
        <p className="text-xs text-muted-foreground">
          Quizlet export, CSV or TSV, Anki (.apkg or text export), a Matrx deck
          (.json) or a whole library (.zip). Your cards come in exactly as they
          are — no AI.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="import-text" className="flex items-center gap-1.5">
          <ClipboardPaste className="h-3.5 w-3.5" />
          Or paste term and definition pairs, one card per line
        </Label>
        <Textarea
          id="import-text"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setCsvRows(null);
          }}
          placeholder={
            "Mitochondria\tThe organelle that makes most of the cell's ATP\nRibosome\tWhere proteins are assembled from amino acids"
          }
          className="min-h-40 resize-y font-mono text-base sm:text-sm"
          disabled={busy}
        />
      </div>

      {raw.trim() ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-name">
                Deck name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="import-name"
                value={setName}
                onChange={(e) => setSetName(e.target.value)}
                placeholder="e.g. Spanish Unit 3 vocabulary"
                className="text-base"
                disabled={busy}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-delimiter">Each line is split by</Label>
              <Select
                value={delimiter}
                onValueChange={(v) => {
                  setDelimiter(v as FieldDelimiter);
                  setCsvRows(null);
                }}
                disabled={busy}
              >
                <SelectTrigger id="import-delimiter" className="h-11 text-base sm:h-9">
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
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">
                {rows.length} {rows.length === 1 ? "card" : "cards"} ready to import
              </span>
              {skipped.length > 0 ? (
                <span className="inline-flex items-center gap-1 text-warning">
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
                Skipped lines had nothing to split on or a blank side — they were
                left out rather than guessed. Change what each line is split by
                if that looks wrong.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
          <ErrorAlchemyMenu error={error} operation="Import a deck file" />
        </p>
      ) : null}

      {raw.trim() ? (
        <div className="flex justify-end">
          <Button type="submit" className="h-11 sm:h-9" disabled={!canSubmit}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
            )}
            {isNavigating
              ? "Opening…"
              : `Import ${rows.length} ${rows.length === 1 ? "card" : "cards"}`}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
