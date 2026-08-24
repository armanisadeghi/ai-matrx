"use client";

/**
 * LessonScriptsBlock — THE renderer for the `lesson_script_set` kind. There
 * is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * A registered shape gets exactly ONE component: this one renders a set of
 * spoken lesson scripts in the workflow run surface, in the live run window,
 * and in chat — the same pixels everywhere. Need one part on its own? Import
 * `LessonScriptSectionCard`. Do not build a second lessons view.
 *
 * Streaming-first by construction: it mounts the instant the discriminator
 * parses, and each section appears as its object closes. A section whose
 * heading has arrived but whose narration is still streaming (`script: null`
 * from the bridge) renders a subtle per-section skeleton — never a spinner
 * page, never raw JSON.
 *
 * Consumes the bridge serverData from
 * `features/content-ir/kinds/lesson-scripts.ts`; `readLessonScriptsData` also
 * accepts a raw persisted value (wire spellings), because persisted surfaces
 * hand the block the stored document directly.
 */

import { useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  Copy,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { toast } from "@/lib/toast";

import type {
  LessonScriptSection,
  LessonScriptsData,
} from "@/features/content-ir/kinds/lesson-scripts";
import { lessonScriptsMarkdownFromValue } from "@/features/content-ir/kinds/lesson-scripts";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Readers — bridge output or raw persisted value, idempotent on purpose.
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v !== "");
}

/**
 * Accepts BOTH spellings of every renamed field (the study-notes lesson:
 * bridge output is camelCase, the persisted wire value is snake_case, and
 * this reader runs on either — reading only one spelling silently blanks the
 * other path).
 */
function coerceSection(section: Record<string, unknown>): LessonScriptSection {
  const rawScript = section.script;
  const rawDuration = section.duration_seconds;
  return {
    heading: typeof section.heading === "string" ? section.heading : "",
    script:
      typeof rawScript === "string" && rawScript !== "" ? rawScript : null,
    duration_seconds:
      typeof rawDuration === "number" && Number.isFinite(rawDuration)
        ? rawDuration
        : null,
    key_points: stringList(section.key_points),
  };
}

export function readLessonScriptsData(serverData: unknown): LessonScriptsData {
  const record = isRecord(serverData) ? serverData : {};
  const rawSections = Array.isArray(record.sections) ? record.sections : [];
  return {
    title: typeof record.title === "string" ? record.title : "",
    overview: typeof record.overview === "string" ? record.overview : "",
    sections: rawSections.filter(isRecord).map(coerceSection),
    // Bridge output carries the flag; a raw persisted value is complete.
    isComplete: record.isComplete !== false,
  };
}

// ---------------------------------------------------------------------------
// Copy affordances — one click, three formats, per-section narration.
// ---------------------------------------------------------------------------

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Couldn't copy");
  }
}

/** The wire-spelling value object — what JSON copy hands to another tool. */
function toWireValue(data: LessonScriptsData): Record<string, unknown> {
  return {
    title: data.title,
    overview: data.overview,
    sections: data.sections.map((section) => ({
      heading: section.heading,
      script: section.script ?? "",
      ...(section.duration_seconds !== null
        ? { duration_seconds: section.duration_seconds }
        : {}),
      ...(section.key_points.length > 0
        ? { key_points: section.key_points }
        : {}),
    })),
  };
}

/** Plain narration only — the TTS-ready reading of the whole set. */
function toPlainText(data: LessonScriptsData): string {
  return [
    data.title,
    data.overview,
    ...data.sections.map((section) =>
      [section.heading, section.script ?? ""].filter(Boolean).join("\n\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function CopyChip({
  label,
  makeText,
  what,
}: {
  label: string;
  makeText: () => string;
  what: string;
}) {
  return (
    <button
      type="button"
      onClick={() => void copyText(makeText(), what)}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title={`Copy as ${what}`}
    >
      <Copy className="h-3 w-3" />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Parts — importable on their own, the only sanctioned partial render.
// ---------------------------------------------------------------------------

/** Subtle skeleton shown inside a section whose narration is still arriving. */
function SectionSkeleton() {
  return (
    <div className="mt-2 space-y-1.5" aria-busy="true">
      <div className="h-2.5 w-full animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-11/12 animate-pulse rounded bg-muted" />
      <div className="h-2.5 w-3/5 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function LessonScriptSectionCard({
  section,
  index,
}: {
  section: LessonScriptSection;
  index: number;
}) {
  const [open, setOpen] = useState(index === 0);
  const [copied, setCopied] = useState(false);
  const streaming = section.script === null;

  const handleCopy = async () => {
    await copyText(section.script ?? "", "Section script");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {section.heading}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        {section.duration_seconds !== null ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatDuration(section.duration_seconds)}
          </span>
        ) : null}
        {streaming ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Copy this section's script"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      {open ? (
        <div className="border-t border-border px-3 pb-3 pt-2">
          {streaming ? (
            <SectionSkeleton />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {section.script}
            </p>
          )}

          {section.key_points.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {section.key_points.map((point, i) => (
                <li
                  key={i}
                  className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                >
                  <span
                    aria-hidden
                    className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The block.
// ---------------------------------------------------------------------------

export interface LessonScriptsBlockProps {
  serverData?: unknown;
  className?: string;
}

export default function LessonScriptsBlock({
  serverData,
  className,
}: LessonScriptsBlockProps) {
  const data = readLessonScriptsData(serverData);
  const { title, overview, sections, isComplete } = data;

  if (isComplete && title === "" && overview === "" && sections.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No lesson scripts were written for this material.
      </div>
    );
  }

  return (
    <article className={cn("space-y-3 text-foreground", className)}>
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold leading-snug">
            <GraduationCap className="h-4 w-4 shrink-0 text-muted-foreground" />
            {title || "Lesson scripts"}
          </h2>
          {overview ? (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {overview}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyChip
            label="JSON"
            what="JSON"
            makeText={() => JSON.stringify(toWireValue(data), null, 2)}
          />
          <CopyChip
            label="MD"
            what="Markdown"
            makeText={() => lessonScriptsMarkdownFromValue(toWireValue(data))}
          />
          <CopyChip
            label="TXT"
            what="Plain text"
            makeText={() => toPlainText(data)}
          />
        </div>
      </header>

      {sections.length > 0 ? (
        <div className="space-y-2">
          {sections.map((section, index) => (
            <LessonScriptSectionCard
              key={`${section.heading}-${index}`}
              section={section}
              index={index}
            />
          ))}
        </div>
      ) : null}

      {!isComplete ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Still writing
        </p>
      ) : null}
    </article>
  );
}
