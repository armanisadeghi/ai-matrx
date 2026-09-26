"use client";

// features/podcasts/generator/components/SourceResolverPanel.tsx
//
// The control for a `resolve` source (website · note · YouTube · audio file).
// It fetches/cleans the external content into editable text, shows that text in
// a textarea the user can review and edit, and reports the final text up to the
// form (which sends it as `input_data` on generate).
//
// Resolution reuses platform primitives only — see useSourceResolvers:
//   website    → useScraperApi + Web Content Extractor agent
//   youtube    → YouTube Transcription & Research agent
//   audio_file → useFileUpload (durable) + useAudioTranscription (STT)
//   note       → the picked note's content (read inline from useNotes)

import { useEffect, useRef, useState } from "react";
import {
  Globe,
  FileAudio,
  StickyNote,
  ChevronDown,
  Loader2,
  Search,
  UploadCloud,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Youtube } from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { ProTextarea } from "@/components/official/ProTextarea";
import { NotePickerPopover } from "@/features/notes/components/NotePickerPopover";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { extractErrorMessage } from "@/utils/errors";
import type { ResolveKind } from "../constants";
import { useSourceResolvers } from "../useSourceResolvers";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface SourceResolverPanelProps {
  resolveKind: ResolveKind;
  /** Resolved editable text — lifted to the form for the generate call. */
  value: string;
  onChange: (text: string) => void;
  /** RTL for Persian / Arabic. */
  rtl?: boolean;
  /** Tells the form whether a resolve is in flight (disables Generate). */
  onBusyChange?: (busy: boolean) => void;
}

export function SourceResolverPanel({
  resolveKind,
  value,
  onChange,
  rtl,
  onBusyChange,
}: SourceResolverPanelProps) {
  if (resolveKind === "note") {
    return (
      <NoteResolver
        value={value}
        onChange={onChange}
        rtl={rtl}
        onBusyChange={onBusyChange}
      />
    );
  }
  return (
    <FetchResolver
      resolveKind={resolveKind}
      value={value}
      onChange={onChange}
      rtl={rtl}
      onBusyChange={onBusyChange}
    />
  );
}

// ── Website · YouTube · Audio file — async fetch into editable text ──────────

function FetchResolver({
  resolveKind,
  value,
  onChange,
  rtl,
  onBusyChange,
}: SourceResolverPanelProps) {
  const {
    resolveWebsite,
    resolveYouTube,
    resolveAudioFile,
    agentRunning,
    audioBusy,
  } = useSourceResolvers();

  const [url, setUrl] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = agentRunning || audioBusy;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const meta = RESOLVER_META[resolveKind];

  const runUrlResolve = async () => {
    const target = url.trim();
    if (!target) return;
    setError(null);
    setResolved(false);
    setStatus(meta.runningLabel);
    try {
      const text =
        resolveKind === "youtube"
          ? await resolveYouTube(target, (t) => onChange(t))
          : await resolveWebsite(target, (t) => onChange(t));
      onChange(text);
      setResolved(true);
      setStatus("");
    } catch (err) {
      setError(extractErrorMessage(err));
      setStatus("");
    }
  };

  const runAudioResolve = async (file: File) => {
    setError(null);
    setResolved(false);
    try {
      const { text } = await resolveAudioFile(file, setStatus);
      onChange(text);
      setResolved(true);
      setStatus("");
    } catch (err) {
      setError(extractErrorMessage(err));
      setStatus("");
    }
  };

  const Icon = meta.icon;

  return (
    <div className="space-y-2.5">
      {resolveKind === "audio_file" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) runAudioResolve(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="gap-2"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="h-4 w-4" />
            )}
            {busy ? status || "Working…" : "Choose audio file"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {meta.helper}
          </span>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !busy) {
                    e.preventDefault();
                    runUrlResolve();
                  }
                }}
                placeholder={meta.placeholder}
                inputMode="url"
                disabled={busy}
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              onClick={runUrlResolve}
              disabled={busy || !url.trim()}
              className="gap-1.5"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {busy ? "Working…" : meta.actionLabel}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">{meta.helper}</p>
        </div>
      )}

      {busy && status && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {status}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
          <ErrorAlchemyMenu error={error} />
        </div>
      )}

      {(value || resolved) && (
        <ResolvedTextEditor
          value={value}
          onChange={(t) => {
            onChange(t);
            setResolved(true);
          }}
          rtl={rtl}
          resolvedLabel={meta.resolvedLabel}
        />
      )}
    </div>
  );
}

// ── Note picker — read the chosen note's content from Redux (no fetch) ───────

function NoteResolver({
  value,
  onChange,
  rtl,
  onBusyChange,
}: Omit<SourceResolverPanelProps, "resolveKind">) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectionRequestRef = useRef(0);

  useEffect(() => {
    onBusyChange?.(isResolving);
  }, [isResolving, onBusyChange]);

  useEffect(
    () => () => {
      selectionRequestRef.current += 1;
    },
    [],
  );

  const handlePick = async (noteId: string) => {
    const requestId = ++selectionRequestRef.current;
    setIsResolving(true);
    setError(null);
    try {
      const note = await NotesAPI.getById(noteId, { failureMode: "throw" });
      if (requestId !== selectionRequestRef.current) return;
      if (!note) {
        throw new Error(
          "That note is no longer available. Choose another note.",
        );
      }
      setPickedId(note.id);
      setPickedLabel(note.label || "Untitled note");
      onChange(note.content ?? "");
    } catch (err) {
      if (requestId !== selectionRequestRef.current) return;
      setError(extractErrorMessage(err));
    } finally {
      if (requestId === selectionRequestRef.current) {
        setIsResolving(false);
      }
    }
  };

  return (
    <div className="space-y-2.5">
      <NotePickerPopover
        onSelectNote={handlePick}
        trigger={
          <Button
            type="button"
            variant="outline"
            disabled={isResolving}
            className="w-full justify-between gap-3"
          >
            <span className="flex min-w-0 items-center gap-2">
              {isResolving ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate">
                {isResolving
                  ? "Loading note…"
                  : (pickedLabel ?? "Choose a note")}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Button>
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
          <ErrorAlchemyMenu className="ml-auto" />
        </div>
      )}

      {pickedId && (
        <ResolvedTextEditor
          value={value}
          onChange={onChange}
          rtl={rtl}
          resolvedLabel="Note content — edit before generating"
        />
      )}
    </div>
  );
}

// ── Shared editable textarea for resolved content ────────────────────────────

function ResolvedTextEditor({
  value,
  onChange,
  rtl,
  resolvedLabel,
}: {
  value: string;
  onChange: (text: string) => void;
  rtl?: boolean;
  resolvedLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          {resolvedLabel}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {value.length.toLocaleString()} chars
        </span>
      </div>
      <ProTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="The cleaned content appears here — review and edit before generating."
        rows={8}
        dir={rtl ? "rtl" : undefined}
        autoGrow
        minHeight={168}
        maxHeight={420}
        enableTextStats
        className="text-base"
      />
    </div>
  );
}

// ── Per-kind copy / icons ────────────────────────────────────────────────────

const RESOLVER_META: Record<
  ResolveKind,
  {
    icon: typeof Globe;
    placeholder: string;
    helper: string;
    actionLabel: string;
    runningLabel: string;
    resolvedLabel: string;
  }
> = {
  website: {
    icon: Globe,
    placeholder: "https://example.com/article",
    helper: "We scrape the page, then clean it into editable source text.",
    actionLabel: "Fetch",
    runningLabel: "Scraping and cleaning the page…",
    resolvedLabel: "Cleaned page content — edit before generating",
  },
  youtube: {
    icon: Youtube,
    placeholder: "https://www.youtube.com/watch?v=…",
    helper: "We transcribe and research the video into editable source text.",
    actionLabel: "Transcribe",
    runningLabel: "Transcribing and researching the video…",
    resolvedLabel: "Transcript & research — edit before generating",
  },
  audio_file: {
    icon: FileAudio,
    placeholder: "",
    helper: "Drop or choose any audio file — we transcribe it for you.",
    actionLabel: "Transcribe",
    runningLabel: "Transcribing the audio…",
    resolvedLabel: "Transcript — edit before generating",
  },
  note: {
    icon: StickyNote,
    placeholder: "",
    helper: "",
    actionLabel: "",
    runningLabel: "",
    resolvedLabel: "Note content — edit before generating",
  },
};
