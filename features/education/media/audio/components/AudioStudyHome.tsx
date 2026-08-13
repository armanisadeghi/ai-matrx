"use client";

// features/education/media/audio/components/AudioStudyHome.tsx
//
// The list-first home for the Audio Study tool (the /education/audio-study
// "savior" list view, NOT a forced detail page). Lists every audio study the
// user owns or can see (RLS-filtered, recent-first), with a New button and a
// separate entry into the live spoken Audio Review session.
//
// React Compiler is on: no manual memo.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Headphones,
  Plus,
  Mic,
  Loader2,
  AlertCircle,
  CheckCircle2,
  MessagesSquare,
  Radio,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createEducationAudioStudyScope,
  type AudioLibraryEntry,
} from "@/features/surfaces/manifests/education-audio-study.manifest";
import { studyMediaService } from "../../service";
import type { StudyMediaRow } from "../../types";

const SURFACE_NAME = "matrx-user/education-audio-study";

const FORMAT_ICON: Record<string, typeof Headphones> = {
  overview: Radio,
  debate: MessagesSquare,
  panel: Users,
  review: Mic,
};

export function AudioStudyHome() {
  const router = useRouter();
  const [rows, setRows] = useState<StudyMediaRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Read at trigger time, never from stale closure state.
  const buildScope = () =>
    createEducationAudioStudyScope({
      view: "list",
      library_loaded: !loading,
      ...(loading
        ? {}
        : {
            audio_count: rows.length,
            audio_library: rows.map(
              (r): AudioLibraryEntry => ({
                id: r.id,
                title: r.title,
                format: r.audio_format,
                source_title: r.source_title,
                status: r.status,
              }),
            ),
          }),
    });

  useEffect(() => {
    let active = true;
    studyMediaService.listByKind("audio").then((res) => {
      if (!active) return;
      setRows(res.data ?? []);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <SurfaceRuntimeProvider surfaceName={SURFACE_NAME} getScope={buildScope}>
    <div className="mx-auto w-full max-w-3xl space-y-5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Headphones className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Audio Study</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.push("/education/audio-study/review")}>
            <Mic className="h-4 w-4" />
            Audio review
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/education/audio-study/new")}>
            <Plus className="h-4 w-4" />
            New audio
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Produced audio from your material — narrated overviews, two-voice debates, and expert
        panels — plus spoken review sessions that quiz you out loud.
      </p>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState onNew={() => router.push("/education/audio-study/new")} />
      ) : (
        <ul className="space-y-2" data-surface-value="audio_library">
          {rows.map((row) => (
            <AudioRow key={row.id} row={row} href={`/education/audio-study/${row.id}`} />
          ))}
        </ul>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}

// An audio study item is a real record with its own page, so the row is an
// ANCHOR, not a <button>. As a button it navigated on click and nothing else —
// no cmd-click, no middle-click, no "open in new tab", no destination on hover.
// Same layout, all four doors back. (`href` replaced an `onOpen` callback so
// the destination lives on the row rather than being handed in imperatively;
// there is exactly one call site.)
function AudioRow({ row, href }: { row: StudyMediaRow; href: string }) {
  const Icon = FORMAT_ICON[row.audio_format ?? "overview"] ?? Headphones;
  return (
    <li>
      <Link
        href={href}
        className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
      >
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{row.title}</div>
          {row.source_title && (
            <div className="truncate text-[11px] text-muted-foreground">from {row.source_title}</div>
          )}
        </div>
        <StatusChip status={row.status} />
      </Link>
    </li>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "ready") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5" /> Ready
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-1 text-[11px] text-destructive">
        <AlertCircle className="h-3.5 w-3.5" /> Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating
    </span>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
      <Headphones className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        No audio yet. Turn a deck or a topic into a produced audio session.
      </p>
      <Button size="sm" className="gap-1.5" onClick={onNew}>
        <Plus className="h-4 w-4" />
        New audio
      </Button>
    </div>
  );
}
