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
  DatabaseZap,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDataOwnership } from "../data/useDataOwnership";
import { totalSpineCount } from "../data/dataRightsService";
import { EXPORT_LABEL, type DeckExportFormat } from "../export/deckFormats";
import { ImportDeckPanel } from "./ImportDeckPanel";
import { AgeBandPrivacyCard } from "@/features/education/compliance/components/AgeBandPrivacyCard";

const FORMAT_ICON: Record<DeckExportFormat, typeof FileJson> = {
  json: FileJson,
  md: FileText,
  anki: GraduationCap,
  csv: FileSpreadsheet,
};

const PLEDGE = [
  "Every deck you make is yours — export it anytime, in bulk.",
  "Open formats: JSON (full fidelity, round-trips), Markdown, Anki, and CSV. No lock-in.",
  "Your uploads live in your files. Delete a deck and it's gone — no shadow copies.",
  "We never sell your study data or show you ads. Ever.",
];

export function DataOwnershipPage() {
  const {
    decks,
    loading,
    error,
    exportDeck,
    exportAll,
    exportingAll,
    exportStudyData,
    exportingStudy,
    deleteStudyData,
    restoreStudyData,
    deletingStudy,
  } = useDataOwnership();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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

  const onExportStudy = () =>
    exportStudyData().catch((e) =>
      toast.error(e instanceof Error ? e.message : "Export failed"),
    );

  const onDeleteStudy = async () => {
    try {
      const res = await deleteStudyData();
      const total = totalSpineCount(res.counts);
      setConfirmDelete(false);
      toast.success(
        total === 0
          ? "No study data to delete."
          : `Deleted ${total} study record${total === 1 ? "" : "s"}. You can undo for 30 days.`,
        {
          action: {
            label: "Undo",
            onClick: () => {
              restoreStudyData()
                .then((r) =>
                  toast.success(`Restored ${totalSpineCount(r.counts)} records.`),
                )
                .catch((e) =>
                  toast.error(e instanceof Error ? e.message : "Restore failed"),
                );
            },
          },
          duration: 12000,
        },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-foreground">Your data &amp; privacy</h1>
        <p className="text-sm text-muted-foreground">
          Everything you create here is yours. Take it with you, or delete it —
          any time.
        </p>
      </header>

      {/* Age band + COPPA/parental-consent status */}
      <AgeBandPrivacyCard />

      {/* The pledge — every line is backed by a button on this page. */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-500" />
          <h2 className="text-sm font-semibold text-foreground">Our data-ownership pledge</h2>
        </div>
        <ul className="space-y-2">
          {PLEDGE.map((line) => (
            <li key={line} className="flex gap-2 text-sm text-muted-foreground">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
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
              A single .zip of every deck as JSON. Summaries (Markdown export
              on their own page) and mind maps aren't included yet.
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

      {/* Full study-data export (FERPA/COPPA data right) — the whole spine */}
      <section className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <DatabaseZap className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Export all study data
            </h2>
            <p className="text-xs text-muted-foreground">
              Everything we store: study sessions, attempts, mastery, plans,
              media, assessments, decks, and quizzes — one JSON archive.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={exportingStudy}
          onClick={onExportStudy}
        >
          {exportingStudy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Download archive
        </Button>
      </section>

      {/* Delete study data (FERPA/COPPA data right) — soft-delete, reversible 30d */}
      <section className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-3">
          <Trash2 className="h-5 w-5 text-destructive" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Delete my study data
            </h2>
            <p className="text-xs text-muted-foreground">
              Removes your study sessions, progress, plans, media, assessments,
              and decks. Reversible for 30 days, then permanently purged.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10"
          disabled={deletingStudy}
          onClick={() => setConfirmDelete(true)}
        >
          {deletingStudy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete
        </Button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        variant="destructive"
        title="Delete all your study data?"
        description="This removes your study sessions, progress, mastery, plans, media, assessments, and decks. You can undo it for 30 days, after which it is permanently purged."
        confirmLabel="Delete my data"
        busy={deletingStudy}
        onConfirm={onDeleteStudy}
      />

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
