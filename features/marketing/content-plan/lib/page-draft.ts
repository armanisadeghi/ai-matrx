/**
 * The page's WORDS — the P4 draft record, as the client reads and edits it.
 *
 * `plan.node_artifact` holds the pipeline's output for a page. Two of its kinds
 * carry the page's actual content, in the same shape:
 *
 *  - `draft`  — what the writer (or a HUMAN editing here) produced: `PageDraft`.
 *  - `review` — the reviewer's issues plus `revised`, a complete `PageDraft`.
 *
 * This module is the client mirror of aidream `page_pipeline.approved_content`
 * (services/content_plan/page_pipeline.py) — the SAME recency rule, because the
 * editor must open exactly the words the builder will render. Preferring the
 * review unconditionally would show the user a reviewer's version while the
 * build renders their own newer edit; preferring the draft would hide the
 * reviewer's corrections. Whichever artifact was written last wins, in both
 * places. If that rule ever changes, it changes in both files or the editor
 * starts lying about what ships.
 *
 * Parsing is TOLERANT of a stale shape and never throws: an artifact written by
 * an older agent version degrades to the next-newest record, exactly as the
 * server does, so a schema change can never make a page uneditable.
 */
import type { PlanNodeArtifactRow } from "../types";

export interface PageDraftSection {
  heading: string;
  /** 2 or 3 — the page's own h1 is the `h1` field, never a section. */
  level: number;
  /** What this section is FOR. Survives editing; the note a later editor reads. */
  intent: string;
  /** Plain prose. NEVER HTML — the builder renders this. */
  body: string;
  bullets: string[];
}

export interface PageDraft {
  h1: string;
  intro: string;
  sections: PageDraftSection[];
  call_to_action: string;
  meta_title: string;
  meta_description: string;
}

/** Where the words on screen came from — the editor says this out loud. */
export interface ResolvedPageDraft {
  draft: PageDraft;
  /** The artifact the content was read from. */
  artifact: PlanNodeArtifactRow;
  source: "draft" | "review";
  /** True when a person typed this revision (`produced_by.authored_by`). */
  humanAuthored: boolean;
  /** The reviewer's findings, when this content came from a review. */
  issues: PageReviewIssue[];
}

export interface PageReviewIssue {
  severity: "blocker" | "important" | "minor";
  section: string;
  problem: string;
  fix: string;
}

export const EMPTY_PAGE_DRAFT: PageDraft = {
  h1: "",
  intro: "",
  sections: [],
  call_to_action: "",
  meta_title: "",
  meta_description: "",
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function strList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSection(value: unknown): PageDraftSection | null {
  const record = asRecord(value);
  if (!record) return null;
  const level = record.level;
  return {
    heading: str(record.heading),
    level: level === 3 ? 3 : 2,
    intent: str(record.intent),
    body: str(record.body),
    bullets: strList(record.bullets),
  };
}

/**
 * A `PageDraft` out of raw artifact content, or null when the object carries no
 * page at all. A missing optional field is normal (the server defaults them);
 * only a missing `h1` AND no sections means "this isn't a draft".
 */
export function parsePageDraft(value: unknown): PageDraft | null {
  const record = asRecord(value);
  if (!record) return null;
  const sections = Array.isArray(record.sections)
    ? record.sections
        .map(parseSection)
        .filter((section): section is PageDraftSection => section !== null)
    : [];
  const h1 = str(record.h1);
  if (!h1 && sections.length === 0) return null;
  return {
    h1,
    intro: str(record.intro),
    sections,
    call_to_action: str(record.call_to_action),
    meta_title: str(record.meta_title),
    meta_description: str(record.meta_description),
  };
}

function parseIssues(value: unknown): PageReviewIssue[] {
  if (!Array.isArray(value)) return [];
  const issues: PageReviewIssue[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const severity = str(record.severity);
    issues.push({
      severity:
        severity === "blocker" || severity === "important"
          ? severity
          : "minor",
      section: str(record.section),
      problem: str(record.problem),
      fix: str(record.fix),
    });
  }
  return issues;
}

/** Did a PERSON write this revision? (`produced_by.authored_by === "human"`) */
export function isHumanAuthored(artifact: PlanNodeArtifactRow): boolean {
  const produced = asRecord(artifact.produced_by);
  return produced?.authored_by === "human";
}

const CURRENT = (row: PlanNodeArtifactRow) => row.valid_to === null;

/** The current (non-superseded) artifact of one kind, or null. */
export function currentArtifact(
  artifacts: readonly PlanNodeArtifactRow[],
  kind: string,
): PlanNodeArtifactRow | null {
  return artifacts.find((row) => row.kind === kind && CURRENT(row)) ?? null;
}

function newerFirst(a: PlanNodeArtifactRow, b: PlanNodeArtifactRow): number {
  return b.created_at.localeCompare(a.created_at);
}

/**
 * The content this page's build will render — the client half of
 * `approved_content`. Returns null when the page has never been written, which
 * is a NORMAL state (the builder then composes from the brief).
 */
export function resolvePageDraft(
  artifacts: readonly PlanNodeArtifactRow[],
): ResolvedPageDraft | null {
  const candidates = [
    currentArtifact(artifacts, "review"),
    currentArtifact(artifacts, "draft"),
  ].filter((row): row is PlanNodeArtifactRow => row !== null);
  candidates.sort(newerFirst);

  for (const artifact of candidates) {
    const content = asRecord(artifact.content);
    if (!content) continue;
    if (artifact.kind === "review") {
      const draft = parsePageDraft(content.revised);
      if (draft) {
        return {
          draft,
          artifact,
          source: "review",
          humanAuthored: isHumanAuthored(artifact),
          issues: parseIssues(content.issues),
        };
      }
      continue;
    }
    const draft = parsePageDraft(content);
    if (draft) {
      return {
        draft,
        artifact,
        source: "draft",
        humanAuthored: isHumanAuthored(artifact),
        issues: [],
      };
    }
  }
  return null;
}

/**
 * Is the page's review no longer describing what ships?
 *
 * A review reads the draft that existed when it ran. A newer draft — a re-run
 * writer, or a HUMAN saving their own edit — means the reviewer never saw the
 * words the build will render. The rail must SAY that rather than show two
 * green steps (the known soft edge in the Website Factory handoff): "reviewed"
 * beside unreviewed prose is worse than no signal at all.
 */
export function isReviewStale(
  artifacts: readonly PlanNodeArtifactRow[],
): boolean {
  const review = currentArtifact(artifacts, "review");
  const draft = currentArtifact(artifacts, "draft");
  if (!review || !draft) return false;
  return draft.created_at.localeCompare(review.created_at) > 0;
}

/** Every revision of the page's words, newest first — the edit history. */
export function draftRevisions(
  artifacts: readonly PlanNodeArtifactRow[],
): PlanNodeArtifactRow[] {
  return artifacts
    .filter((row) => row.kind === "draft" || row.kind === "review")
    .slice()
    .sort(newerFirst);
}

/** Rough length of the page as written — the editor's one honest word count. */
export function draftWordCount(draft: PageDraft): number {
  const words = (text: string) =>
    text.trim() === "" ? 0 : text.trim().split(/\s+/u).length;
  return (
    words(draft.intro) +
    words(draft.call_to_action) +
    draft.sections.reduce(
      (total, section) =>
        total +
        words(section.heading) +
        words(section.body) +
        section.bullets.reduce((sum, bullet) => sum + words(bullet), 0),
      0,
    )
  );
}
