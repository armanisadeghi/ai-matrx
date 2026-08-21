"use client";

// features/education/onboard/components/StartHero.tsx
//
// The Upload Hero flow — the front door of the Education Hub (P9). Drop/paste
// ANY input → pick what to make → one grounded, cited study kit. Ingest owns
// raw→text (useIngest), the converter owns text→artifact (useContentConverter),
// this component owns the flow + progressive UI. Targets light up as their
// generators register (isTargetAvailable) — no change here needed.

import { useCallback, useRef, useState } from "react";
import {
  Upload,
  FileText,
  Link2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  PackageOpen,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useEntitlementGuard } from "@/features/entitlements/components/useEntitlementGuard";
import { useAiComplianceGate } from "@/features/education/compliance/useAiComplianceGate";
import { EntitlementMeter } from "@/features/entitlements/components/EntitlementMeter";
import { getGenerator, isTargetAvailable } from "@/features/education/convert/registry";
import { ALL_TARGET_KINDS, type TargetKind } from "@/features/education/convert/types";
import { TARGET_PRESENTATION } from "@/features/education/convert/targetPresentation";
import type { CoverageDepth } from "@/features/education/convert/coverage";
import { useKitGeneration } from "../useKitGeneration";
import { KitBoard } from "./KitBoard";
import { KitDepthPicker } from "./KitDepthPicker";
import {
  INGEST_ACCEPT,
  describeIngestSupport,
  describeUrlSupport,
  classifyIngestUrl,
} from "../formatSupport";


type InputMode = "upload" | "paste" | "link";

const DEFAULT_TARGETS: TargetKind[] = ["deck", "summary", "mind_map"];

export function StartHero() {
  const kit = useKitGeneration();
  const ingestGuard = useEntitlementGuard("education.ingest_document");
  // School-safe COPPA gate: an under-13 account with no active guardian link is
  // blocked from AI generation until a parent approves (never a silent failure).
  const coppa = useAiComplianceGate();

  const [mode, setMode] = useState<InputMode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<Set<TargetKind>>(
    () => new Set(DEFAULT_TARGETS),
  );
  const [focus, setFocus] = useState("");
  // How much kit to build. `depth` scales everything; `count` is the exact
  // number for a student who knows what they want (blank = size to the source).
  const [depth, setDepth] = useState<CoverageDepth>("standard");
  const [count, setCount] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleTarget = useCallback((kind: TargetKind) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const isYouTube = classifyIngestUrl(url) === "youtube";

  // An unsupported file (Office / HEIC / unknown) is honestly blocked up front —
  // FileSupportNote already explains why — so we never start a doomed run or
  // spend the entitlement check on it.
  const fileSupported = !file || describeIngestSupport(file).supported;

  const hasInput =
    (mode === "upload" && !!file && fileSupported) ||
    (mode === "paste" && pasteText.trim().length > 0) ||
    (mode === "link" && url.trim().length > 0);

  const canGenerate = hasInput && selected.size > 0 && !kit.busy;

  const onGenerate = useCallback(async () => {
    if (!canGenerate) return;
    // School-safe gate FIRST (COPPA): is this account allowed to collect/process
    // data at all? An unconsented under-13 opens the "a parent must approve"
    // dialog and never reaches the billing gate or starts a run.
    if (!(await coppa.ensureAllowed())) return;
    // Canonical guard (P8): server-truth check BEFORE spending; a cap-hit opens
    // the respectful contextual paywall and never starts the kit build.
    await ingestGuard.guard(async () => {
      const kinds = [...selected].filter(isTargetAvailable);
      const input =
        mode === "upload"
          ? ({ kind: "file", file: file! } as const)
          : mode === "paste"
            ? ({ kind: "paste", text: pasteText } as const)
            : ({
                kind: isYouTube ? "youtube" : "url",
                url,
              } as const);

      const requested = Number.parseInt(count, 10);
      // Meter only a real ingest; an empty selection / failed ingest burns nothing.
      const ok = await kit.run(input, kinds, {
        focus: focus.trim() || undefined,
        depth,
        count: Number.isFinite(requested) && requested > 0 ? requested : undefined,
      });
      if (ok) await ingestGuard.commit();
    });
  }, [
    canGenerate,
    ingestGuard,
    selected,
    mode,
    file,
    pasteText,
    url,
    isYouTube,
    focus,
    depth,
    count,
    kit,
    coppa,
  ]);

  // The board goes up the INSTANT the run starts — ingest included. Hiding it
  // until generation began is what left a multi-minute upload+extract behind a
  // single button spinner with nothing to read.
  const showResults =
    kit.phase === "ingesting" ||
    kit.phase === "generating" ||
    kit.phase === "done";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
      <header className="space-y-2 text-center">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          <PackageOpen className="h-3.5 w-3.5 text-primary" />
          One upload → a full study kit
        </div>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Turn your material into a grounded study kit
        </h1>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Drop a PDF, image, audio, or video — paste your notes, or link a page.
          We build flashcards, a summary, and a mind map — every card cited back
          to your own material.
        </p>
      </header>

      {!showResults && (
        <>
          <InputPanel
            mode={mode}
            onMode={setMode}
            file={file}
            onFile={setFile}
            pasteText={pasteText}
            onPaste={setPasteText}
            url={url}
            onUrl={setUrl}
            dragOver={dragOver}
            onDragOver={setDragOver}
            fileInputRef={fileInputRef}
          />

          {kit.phase === "error" && kit.error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{kit.error}</span>
            </div>
          )}

          <KitPicker selected={selected} onToggle={toggleTarget} />

          <KitDepthPicker
            depth={depth}
            onDepth={setDepth}
            count={count}
            onCount={setCount}
          />

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Focus (optional)
            </label>
            <Input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. focus on the causes, or I have an exam on chapter 3"
              className="text-base"
            />
          </div>

          <div className="flex justify-center">
            <EntitlementMeter
              capability="education.ingest_document"
              showAllWindows
            />
          </div>
          <ingestGuard.Paywall />
          <coppa.Gate />

          <Button
            size="lg"
            className="w-full"
            disabled={!canGenerate || ingestGuard.isChecking}
            onClick={onGenerate}
          >
            {kit.busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Building your kit…
              </>
            ) : (
              <>
                Build my study kit <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
            Grounded in your material. Your files, your data —{" "}
            <Link href="/education/data" className="underline hover:text-foreground">
              export anytime
            </Link>
            .
          </p>
        </>
      )}

      {showResults && <KitBoard kit={kit} onReset={kit.reset} />}
    </div>
  );
}

// ─── Input panel ─────────────────────────────────────────────────────────────

function InputPanel({
  fileInputRef,
  ...props
}: {
  mode: InputMode;
  onMode: (m: InputMode) => void;
  file: File | null;
  onFile: (f: File | null) => void;
  pasteText: string;
  onPaste: (t: string) => void;
  url: string;
  onUrl: (u: string) => void;
  dragOver: boolean;
  onDragOver: (b: boolean) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const modes: { id: InputMode; label: string; icon: LucideIcon }[] = [
    { id: "upload", label: "Upload", icon: Upload },
    { id: "paste", label: "Paste", icon: FileText },
    { id: "link", label: "Link", icon: Link2 },
  ];
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex gap-1 border-b border-border p-1.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => props.onMode(m.id)}
            className={cn(
              "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              props.mode === m.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <m.icon className="h-4 w-4" /> {m.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {props.mode === "upload" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              props.onDragOver(true);
            }}
            onDragLeave={() => props.onDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              props.onDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) props.onFile(f);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors",
              props.dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/40 hover:bg-muted/50",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={INGEST_ACCEPT}
              className="hidden"
              onChange={(e) => props.onFile(e.target.files?.[0] ?? null)}
            />
            {props.file ? (
              <>
                <FileText className="h-8 w-8 text-primary" />
                <p className="text-sm font-medium text-foreground">
                  {props.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(props.file.size / 1024).toFixed(0)} KB · click to change
                </p>
                <FileSupportNote file={props.file} />
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">
                  Drop a file or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  PDF, Word, PowerPoint, Excel, image, audio, video, text, Markdown, or CSV
                </p>
              </>
            )}
          </div>
        )}

        {props.mode === "paste" && (
          <Textarea
            value={props.pasteText}
            onChange={(e) => props.onPaste(e.target.value)}
            placeholder="Paste your notes, an article, a transcript — anything you want to study."
            className="min-h-[180px] resize-y text-base"
          />
        )}

        {props.mode === "link" && (
          <div className="space-y-2">
            <Input
              value={props.url}
              onChange={(e) => props.onUrl(e.target.value)}
              placeholder="https://… or a YouTube link"
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">
              {describeUrlSupport(props.url).note}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Per-file honest status ──────────────────────────────────────────────────

/**
 * The one-line "how we'll read this" status shown the moment a file is chosen —
 * supported kinds explain the pipeline (OCR / transcription / extraction),
 * unsupported kinds say so plainly instead of failing only at generate time.
 * Reads the SAME `formatSupport` truth table the ingest branch uses.
 */
function FileSupportNote({ file }: { file: File }) {
  const support = describeIngestSupport(file);
  if (support.supported) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-500" />
        <span>{support.note}</span>
      </p>
    );
  }
  return (
    <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      <span>{support.note}</span>
    </p>
  );
}

// ─── Kit picker ──────────────────────────────────────────────────────────────

function KitPicker(props: {
  selected: Set<TargetKind>;
  onToggle: (k: TargetKind) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground">
        What should we make?
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ALL_TARGET_KINDS.map((kind) => {
          const gen = getGenerator(kind);
          const available = isTargetAvailable(kind);
          const Icon = TARGET_PRESENTATION[kind].icon;
          const on = props.selected.has(kind);
          return (
            <button
              key={kind}
              disabled={!available}
              onClick={() => props.onToggle(kind)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                !available && "cursor-not-allowed opacity-50",
                available && on
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  available && on ? "text-primary" : "",
                )}
              />
              <span className="flex-1 truncate font-medium">
                {gen?.label ?? kind}
              </span>
              {available ? (
                on && <CheckCircle2 className="h-4 w-4 text-primary" />
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  soon
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
