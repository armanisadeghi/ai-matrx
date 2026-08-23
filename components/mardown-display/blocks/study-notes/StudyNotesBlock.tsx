"use client";

/**
 * StudyNotesBlock — THE renderer for the `study_notes` kind. There is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * A registered shape gets exactly ONE component: this one renders a set of
 * study notes in the workflow run surface, in the live run window, and in chat
 * — the same pixels everywhere. Need one part on its own? Import
 * `StudyNotesSectionCard` or `StudyNotesGlossary`. Do not build a second
 * notes view.
 *
 * Streaming-first by construction: it mounts the instant the discriminator
 * parses, and each section appears as its object closes. A document with a
 * title and no sections yet is a NORMAL mid-stream state — it renders as the
 * notes taking shape, never as a spinner and never as raw JSON.
 *
 * Consumes the bridge serverData from `features/content-ir/kinds/study-notes.ts`;
 * `readStudyNotesData` also accepts a raw value object, because persisted
 * surfaces hand the block the stored document directly.
 */

import { useState } from "react";
import { BookOpen, ChevronDown, Lightbulb, Loader2 } from "lucide-react";

import {
  coerceStudyNotes,
  type GlossaryTerm,
  type StudyNotes,
  type StudyNotesData,
  type StudyNotesSection,
} from "@/features/content-ir/kinds/study-notes";
import { cn } from "@/lib/utils";

/**
 * Accepts either the streaming bridge output ({ notes, isComplete }) or a raw
 * document value.
 */
export function readStudyNotesData(serverData: unknown): StudyNotesData {
  if (
    typeof serverData === "object" &&
    serverData !== null &&
    "notes" in serverData
  ) {
    const data = serverData as { notes?: unknown; isComplete?: unknown };
    return {
      notes: coerceStudyNotes(data.notes),
      isComplete: data.isComplete !== false,
    };
  }
  return { notes: coerceStudyNotes(serverData), isComplete: true };
}

/** One section — heading, the prose, what to remember, what it looks like. */
export function StudyNotesSectionCard({
  section,
  index,
}: {
  section: StudyNotesSection;
  index: number;
}) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="flex items-baseline gap-2 text-base font-semibold text-foreground">
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {index + 1}
        </span>
        {section.heading}
      </h3>

      {section.summary ? (
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {section.summary}
        </p>
      ) : null}

      {section.key_points.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {section.key_points.map((point, i) => (
            <li
              key={i}
              className="flex gap-2.5 text-sm leading-relaxed text-foreground"
            >
              <span
                aria-hidden
                className="mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.examples.length > 0 ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" />
            {section.examples.length === 1 ? "For example" : "For example"}
          </p>
          <ul className="mt-1.5 space-y-1">
            {section.examples.map((example, i) => (
              <li key={i} className="text-sm leading-relaxed text-foreground">
                {example}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** The terms the material assumes — collapsed by default, it is a reference. */
export function StudyNotesGlossary({ terms }: { terms: GlossaryTerm[] }) {
  const [open, setOpen] = useState(false);
  if (terms.length === 0) return null;

  return (
    <div className="border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-sm font-medium text-foreground hover:text-primary"
      >
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        Glossary
        <span className="text-xs font-normal text-muted-foreground">
          {terms.length} {terms.length === 1 ? "term" : "terms"}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <dl className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {terms.map((entry, i) => (
            <div key={`${entry.term}-${i}`}>
              <dt className="text-sm font-medium text-foreground">
                {entry.term}
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">
                {entry.definition}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export interface StudyNotesBlockProps {
  serverData?: unknown;
  className?: string;
}

export default function StudyNotesBlock({
  serverData,
  className,
}: StudyNotesBlockProps) {
  const { notes, isComplete } = readStudyNotesData(serverData);
  const empty = isEmptyNotes(notes);

  if (empty && isComplete) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No notes were written for this material.
      </div>
    );
  }

  return (
    <article className={cn("space-y-4 text-foreground", className)}>
      <header>
        <h2 className="text-lg font-semibold leading-snug">
          {notes.title || "Study notes"}
        </h2>
        {notes.overview ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {notes.overview}
          </p>
        ) : null}
      </header>

      {notes.sections.length > 0 ? (
        <div className="space-y-4">
          {notes.sections.map((section, index) => (
            <StudyNotesSectionCard
              key={`${section.heading}-${index}`}
              section={section}
              index={index}
            />
          ))}
        </div>
      ) : null}

      <StudyNotesGlossary terms={notes.glossary} />

      {!isComplete ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Still writing
        </p>
      ) : null}
    </article>
  );
}

function isEmptyNotes(notes: StudyNotes): boolean {
  return (
    notes.title === "" &&
    notes.overview === "" &&
    notes.sections.length === 0 &&
    notes.glossary.length === 0
  );
}
