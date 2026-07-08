"use client";

// features/education/onboard/components/ImportDeckPanel.tsx
//
// Direct deck import surface (P9): bring an existing deck in AS-IS (no AI) from
// a Quizlet/CSV/TSV/JSON file, an Anki .apkg, or pasted term/definition pairs.
// This is the "import my library" funnel — distinct from the hero flow, which
// GENERATES new material. Lands a native deck and links to it.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, ClipboardPaste, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { importDeckFile, importDelimited, type ImportOutcome } from "../import/importDeck";
import { importAnkiFile, isAnkiFile } from "../import/importAnki";

type Mode = "file" | "paste";

export function ImportDeckPanel() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("file");
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runImport(fn: () => Promise<ImportOutcome>) {
    setBusy(true);
    setResult(null);
    try {
      const outcome = await fn();
      setResult(outcome);
      toast.success(
        `Imported ${outcome.cardCount} card${outcome.cardCount === 1 ? "" : "s"}` +
          (outcome.skipped ? ` (${outcome.skipped} skipped)` : ""),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  const onFile = (file: File) =>
    runImport(() => (isAnkiFile(file) ? importAnkiFile(file) : importDeckFile(file)));

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Import an existing deck</h3>
          <p className="text-xs text-muted-foreground">
            Quizlet, Anki (.apkg), CSV/TSV, Matrx JSON, or pasted pairs — lands as a native deck.
          </p>
        </div>
        <div className="flex gap-1">
          {(["file", "paste"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
                mode === m
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {m === "file" ? <Upload className="h-3.5 w-3.5" /> : <ClipboardPaste className="h-3.5 w-3.5" />}
              {m === "file" ? "File" : "Paste"}
            </button>
          ))}
        </div>
      </div>

      {mode === "file" ? (
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 py-8 text-center hover:bg-muted/50"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".apkg,.csv,.tsv,.txt,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-foreground">Drop a file or click to browse</p>
              <p className="text-xs text-muted-foreground">.apkg · .csv · .tsv · .txt · .json</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="Deck name"
            className="text-sm"
          />
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"term\tdefinition (one per line — tab, comma, or semicolon separated)"}
            className="min-h-[120px] text-sm"
          />
          <Button
            size="sm"
            disabled={busy || !pasteText.trim()}
            onClick={() =>
              runImport(() =>
                importDelimited(pasteText, pasteName.trim() || "Imported deck"),
              )
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
          </Button>
        </div>
      )}

      {result && (
        <div className="mt-3 flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
            <span className="truncate">
              {result.name} · {result.cardCount} cards
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/education/flashcards/${result.setId}`)}
          >
            Open
          </Button>
        </div>
      )}
    </div>
  );
}
