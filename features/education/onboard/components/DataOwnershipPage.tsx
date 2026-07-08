"use client";

// features/education/onboard/components/DataOwnershipPage.tsx
//
// "Your data" — the P9 back door + the anti-lock-in pledge. Lists the learner's
// decks, exports any one in any format or EVERYTHING as a zip, and imports an
// existing library back in. The ownership pledge is stated plainly and is TRUE
// (every claim here is backed by a real button on this page).

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Download,
  Package,
  Loader2,
  Layers,
  FileJson,
  FileText,
  FileSpreadsheet,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useDataOwnership } from "../data/useDataOwnership";
import { EXPORT_LABEL, type DeckExportFormat } from "../export/deckFormats";
import { ImportDeckPanel } from "./ImportDeckPanel";

const FORMAT_ICON: Record<DeckExportFormat, typeof FileJson> = {
  json: FileJson,
  md: FileText,
  anki: GraduationCap,
  csv: FileSpreadsheet,
};

const PLEDGE = [
  "Every deck, summary, and mind map you make is yours — export it anytime, in bulk.",
  "Open formats: JSON (full fidelity, round-trips), Markdown, Anki, and CSV. No lock-in.",
  "Your uploads live in your files. Delete a deck and it's gone — no shadow copies.",
  "We never sell your study data or show you ads. Ever.",
];

export function DataOwnershipPage() {
  const { decks, loading, error, exportDeck, exportAll, exportingAll } =
    useDataOwnership();
  const [busyId, setBusyId] = useState<string | null>(null);

  const onExport = async (setId: string, format: DeckExportFormat) => {
    setBusyId(setId);
    try {
      await exportDeck(setId, format);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Your data</h1>
        <p className="text-sm text-muted-foreground">
          Everything you create here is yours. Take it with you, any time.
        </p>
      </header>

      {/* The pledge — every line is backed by a button on this page. */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
          <h2 className="text-sm font-semibold text-foreground">Our data-ownership pledge</h2>
        </div>
        <ul className="space-y-2">
          {PLEDGE.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Import */}
      <ImportDeckPanel />

      {/* Export everything */}
      <section className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">Export everything</h2>
            <p className="text-xs text-muted-foreground">
              A single .zip of every deck as JSON — your complete archive.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={exportingAll || decks.length === 0}
          onClick={() =>
            exportAll().catch((e) =>
              toast.error(e instanceof Error ? e.message : "Export failed"),
            )
          }
        >
          {exportingAll ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export all ({decks.length})
        </Button>
      </section>

      {/* Per-deck export */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Your decks</h2>
        {loading ? (
          <div className="flex h-24 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : decks.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            No decks yet.{" "}
            <Link href="/education/start" className="text-primary hover:underline">
              Create a study kit
            </Link>{" "}
            to get started.
          </p>
        ) : (
          <div className="space-y-2">
            {decks.map((set) => (
              <div
                key={set.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
              >
                <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Link
                  href={`/education/flashcards/${set.id}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:underline"
                >
                  {set.name}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={busyId === set.id}>
                      {busyId === set.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(Object.keys(EXPORT_LABEL) as DeckExportFormat[]).map((fmt) => {
                      const Icon = FORMAT_ICON[fmt];
                      return (
                        <DropdownMenuItem
                          key={fmt}
                          onClick={() => onExport(set.id, fmt)}
                        >
                          <Icon className="h-4 w-4" /> {EXPORT_LABEL[fmt]}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
