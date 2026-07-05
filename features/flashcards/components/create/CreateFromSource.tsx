"use client";

// features/flashcards/components/create/CreateFromSource.tsx
//
// Phase 5 (Flashcards Competitive Parity Push) — RAG-sourced generation with
// a chunk-level curation UI. The real blocker per the owner wasn't the agent
// (fc_generate_from_source is already specced + registered, AGENT_SPECS.md
// §2) — it's giving the user a checklist of exactly which retrieved
// chunks/sections go into the deck, instead of blindly feeding a whole
// document. This is a two-step wizard on top of existing RAG library
// primitives (useLibrary, useDocument/useDocumentChunks):
//   1. Pick a processed document (from the RAG library, status "ready").
//   2. Check off which chunks to include, set count/difficulty, generate.
//
// Reuses useGenerateCards (the same agent round-trip primitive from-topic
// uses) — only the variables shape + post-generation lineage backfill
// differ. Persistence is fcService.createSetWithCards, same as from-topic;
// per-card `source` lineage edges are written automatically by
// fcService.addCards when `file_id` is set.
//
// Lineage is only attached when the picked document's underlying content is
// an actual uploaded file (`source_kind === "cld_file"`) — a note/code-file
// source has no `cld_files` row to link to, so those decks generate fine but
// skip the lineage edge (documented tradeoff, not a bug).
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileSearch,
  FileText,
  Loader2,
  CheckCheck,
  X as ClearIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useLibrary } from "@/features/rag/hooks/useLibrary";
import { useDocument, useDocumentChunks } from "@/features/rag/hooks/useDocument";
import type { LibraryDocSummary } from "@/features/rag/types/library";
import type { ChunkRow } from "@/features/rag/types/documents";
import { FC_AGENTS } from "../../data/agents";
import { fcService } from "../../data/fcService";
import type { NewCardInput } from "../../data/types";
import { useGenerateCards } from "../../data/useGenerateCards";

const EDU_BASE = "/education/flashcards";

const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;
type Difficulty = (typeof DIFFICULTIES)[number]["value"];

const COUNT_MIN = 1;
const COUNT_MAX = 50;
// Generous ceiling for a curation checklist — most documents have well under
// this many chunks; a doc that doesn't needs virtualization (tracked as a
// follow-up, not blocking the core curation flow).
const CHUNK_FETCH_LIMIT = 800;

// 16px+ inputs prevent the iOS zoom-on-focus; semantic colors throughout.
const FIELD_INPUT_CLASS = "text-base";

type Step = "pick-doc" | "curate";

export function CreateFromSource() {
  const router = useRouter();
  const { generate, isGenerating } = useGenerateCards();
  const [isNavigating, startNavigation] = useTransition();

  const [step, setStep] = useState<Step>("pick-doc");
  const [query, setQuery] = useState("");
  const [selectedDoc, setSelectedDoc] = useState<LibraryDocSummary | null>(
    null,
  );
  const [selectedChunkIds, setSelectedChunkIds] = useState<Set<string>>(
    new Set(),
  );
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  const {
    docs,
    loading: docsLoading,
    error: docsError,
  } = useLibrary({ status: "ready", search: query.trim() || undefined });

  const { data: docDetail } = useDocument(
    step === "curate" ? selectedDoc?.id ?? null : null,
  );
  const {
    data: chunks,
    loading: chunksLoading,
    error: chunksError,
  } = useDocumentChunks(step === "curate" ? selectedDoc?.id ?? null : null, {
    limit: CHUNK_FETCH_LIMIT,
  });

  const busy = isGenerating || isNavigating;
  const readyDocs = docs.filter((d) => d.chunks > 0);

  const goBack = () => {
    if (busy) return;
    if (step === "curate") {
      setStep("pick-doc");
      setSelectedDoc(null);
      setSelectedChunkIds(new Set());
      return;
    }
    startNavigation(() => router.push(EDU_BASE));
  };

  const pickDoc = (doc: LibraryDocSummary) => {
    setSelectedDoc(doc);
    setSelectedChunkIds(new Set());
    setStep("curate");
  };

  const toggleChunk = (chunkId: string) =>
    setSelectedChunkIds((prev) => {
      const next = new Set(prev);
      if (next.has(chunkId)) next.delete(chunkId);
      else next.add(chunkId);
      return next;
    });

  const selectAllChunks = () =>
    setSelectedChunkIds(new Set((chunks ?? []).map((c) => c.chunk_id)));
  const clearChunks = () => setSelectedChunkIds(new Set());

  const canGenerate = selectedChunkIds.size > 0 && !busy;

  const handleGenerate = async () => {
    if (!selectedDoc || !canGenerate) return;
    const selected = (chunks ?? [])
      .filter((c) => selectedChunkIds.has(c.chunk_id))
      .sort((a, b) => a.chunk_index - b.chunk_index);
    if (selected.length === 0) return;

    // Structured per-chunk markers so the agent can echo back which exact
    // chunk_id a card was drawn from (AGENT_SPECS.md §2's per-card `source`).
    const sourceContent = selected
      .map((c) => {
        const pages = c.page_numbers?.length
          ? ` (page ${c.page_numbers.join(", ")})`
          : "";
        return `### Chunk ${c.chunk_id}${pages}\n${c.content_text}`;
      })
      .join("\n\n");
    const safeCount = Math.min(COUNT_MAX, Math.max(COUNT_MIN, count || 10));

    try {
      const result = await generate(FC_AGENTS.generateFromSource, {
        source_content: sourceContent,
        document_id: selectedDoc.id,
        count: safeCount,
        difficulty,
      });

      // Only attach a file-lineage edge when the document is backed by a
      // real cld_files row — a note/code-file source has nothing to link to.
      const fileId =
        docDetail?.source_kind === "cld_file" ? docDetail.source_id : null;
      const cards: NewCardInput[] = result.cards.map((c) => ({
        ...c,
        source: fileId
          ? {
              file_id: fileId,
              processed_document_id:
                c.source?.processed_document_id ?? selectedDoc.id,
              chunk_id: c.source?.chunk_id,
              page: c.source?.page,
            }
          : undefined,
      }));

      const setRes = await fcService.createSetWithCards(
        {
          name: result.set_title?.trim() || selectedDoc.name,
          topic: selectedDoc.name,
          difficulty,
        },
        cards,
      );

      if (setRes.error || !setRes.data) {
        toast.error(setRes.error ?? "Could not save the generated flashcard set");
        return;
      }

      const { set, cards: savedCards } = setRes.data;
      toast.success(
        `Created "${set.name}" with ${savedCards.length} ${savedCards.length === 1 ? "card" : "cards"}`,
      );
      startNavigation(() => router.push(`${EDU_BASE}/${set.id}`));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate flashcards";
      toast.error(message);
    }
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={goBack}
            disabled={busy}
            aria-label={step === "curate" ? "Back to document picker" : "Back to flashcards"}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <FileSearch className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              New set from a document
            </h1>
            <p className="text-sm text-muted-foreground">
              {step === "pick-doc"
                ? "Pick a document from your RAG library, then choose exactly which passages to use."
                : `Curating from "${selectedDoc?.name}"`}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-6">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <LoadingSpinner size="sm" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Generating {Math.min(COUNT_MAX, Math.max(COUNT_MIN, count || 10))}{" "}
                  cards from {selectedChunkIds.size}{" "}
                  {selectedChunkIds.size === 1 ? "passage" : "passages"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  This can take a moment for larger selections.
                </p>
              </div>
            </div>
          ) : step === "pick-doc" ? (
            <DocPickerStep
              docs={readyDocs}
              loading={docsLoading}
              error={docsError}
              query={query}
              onQueryChange={setQuery}
              onPick={pickDoc}
            />
          ) : (
            <CurateStep
              chunks={chunks ?? []}
              loading={chunksLoading}
              error={chunksError}
              selectedIds={selectedChunkIds}
              onToggle={toggleChunk}
              onSelectAll={selectAllChunks}
              onClear={clearChunks}
              count={count}
              onCountChange={setCount}
              difficulty={difficulty}
              onDifficultyChange={setDifficulty}
              busy={busy}
              canGenerate={canGenerate}
              onGenerate={() => void handleGenerate()}
              onCancel={goBack}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DocPickerStep({
  docs,
  loading,
  error,
  query,
  onQueryChange,
  onPick,
}: {
  docs: LibraryDocSummary[];
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (v: string) => void;
  onPick: (doc: LibraryDocSummary) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search your library by document name…"
        className={FIELD_INPUT_CLASS}
        autoFocus
      />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="py-6 text-center text-sm text-destructive">{error}</p>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            No processed documents yet
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Upload and process a PDF or document in your RAG library first —
            once it finishes chunking, it'll show up here to build a deck
            from.
          </p>
          <Button variant="outline" size="sm" asChild className="mt-1">
            <a href="/rag/library">Open RAG library</a>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
          {docs.map((doc) => (
            <li key={doc.id}>
              <button
                type="button"
                onClick={() => onPick(doc)}
                className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {doc.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {doc.chunks} {doc.chunks === 1 ? "passage" : "passages"}
                    {doc.totalPages ? ` · ${doc.totalPages} pages` : ""}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CurateStep({
  chunks,
  loading,
  error,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  count,
  onCountChange,
  difficulty,
  onDifficultyChange,
  busy,
  canGenerate,
  onGenerate,
  onCancel,
}: {
  chunks: ChunkRow[];
  loading: boolean;
  error: string | null;
  selectedIds: Set<string>;
  onToggle: (chunkId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  count: number;
  onCountChange: (v: number) => void;
  difficulty: Difficulty;
  onDifficultyChange: (v: Difficulty) => void;
  busy: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onCancel: () => void;
}) {
  const sorted = [...chunks].sort((a, b) => a.chunk_index - b.chunk_index);

  return (
    <div className="flex flex-col gap-5">
      {/* Chunk checklist */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Select passages to include</Label>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={onSelectAll}
              disabled={busy || sorted.length === 0}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Select all
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={busy || selectedIds.size === 0}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <ClearIcon className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : error ? (
          <p className="py-4 text-center text-sm text-destructive">{error}</p>
        ) : sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            This document has no chunked passages yet.
          </p>
        ) : (
          <ul className="flex max-h-[45vh] flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-1.5">
            {sorted.map((chunk) => (
              <ChunkRowItem
                key={chunk.chunk_id}
                chunk={chunk}
                checked={selectedIds.has(chunk.chunk_id)}
                disabled={busy}
                onToggle={() => onToggle(chunk.chunk_id)}
              />
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground">
          {selectedIds.size} of {sorted.length} passages selected.
        </p>
      </div>

      {/* Count + Difficulty */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fcs-count">Number of cards</Label>
          <Input
            id="fcs-count"
            type="number"
            min={COUNT_MIN}
            max={COUNT_MAX}
            value={count}
            onChange={(e) => onCountChange(Number.parseInt(e.target.value, 10) || 0)}
            className={FIELD_INPUT_CLASS}
            disabled={busy}
          />
          <p className="text-[11px] text-muted-foreground">
            Between {COUNT_MIN} and {COUNT_MAX}.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fcs-difficulty">Difficulty</Label>
          <Select
            value={difficulty}
            onValueChange={(v) => onDifficultyChange(v as Difficulty)}
            disabled={busy}
          >
            <SelectTrigger id="fcs-difficulty" className={FIELD_INPUT_CLASS}>
              <SelectValue placeholder="Select difficulty" />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Back
        </Button>
        <Button type="button" onClick={onGenerate} disabled={!canGenerate}>
          {busy ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <FileSearch className="mr-1.5 h-4 w-4" />
          )}
          Generate
        </Button>
      </div>
    </div>
  );
}

function ChunkRowItem({
  chunk,
  checked,
  disabled,
  onToggle,
}: {
  chunk: ChunkRow;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const preview =
    chunk.content_text.length > 220
      ? `${chunk.content_text.slice(0, 220)}…`
      : chunk.content_text;
  return (
    <li>
      <label
        className={cn(
          "flex items-start gap-2.5 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/40",
          checked && "bg-primary/5",
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={onToggle}
          disabled={disabled}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Passage {chunk.chunk_index + 1}</span>
            {chunk.page_numbers?.length ? (
              <span>· page {chunk.page_numbers.join(", ")}</span>
            ) : null}
            {chunk.token_count ? <span>· {chunk.token_count} tokens</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-foreground/90">{preview}</p>
        </div>
      </label>
    </li>
  );
}
