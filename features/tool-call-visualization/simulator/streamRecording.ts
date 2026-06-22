/**
 * Stream recording model — the realistic timing script for the tool-stream
 * simulator. Pure (no React, no `any`).
 *
 * ─── The principle this file encodes ────────────────────────────────────────
 *
 * Stream ONLY the parts that would really stream; deliver whole objects whole.
 * Search / research results come back from the backend as OBJECTS, not a
 * character trickle. A multi-query research, however, returns each query's
 * result-group as its OWN part over time. So the realistic stream is: each
 * query's result SECTION arriving as one whole unit, spaced out in time —
 * nothing trickles WITHIN a section.
 *
 * A `StreamRecording` is therefore a list of timed `StreamStep`s. Each progress
 * step appends ONE whole section to the accumulating result. The renderer's job
 * (already built) is to reveal sections part-by-part and fast-forward when the
 * next part lands; this file only produces the realistic event timing.
 */

import type { ToolEventPayload } from "@/types/python-generated/stream-events";

/**
 * A single timed event in a recording.
 *
 * `afterMs` is relative to the start of playback (NOT to the previous step),
 * so a consumer can schedule every step against one `t0` with `setTimeout`.
 */
export interface StreamStep {
  /** Delay from playback start, in milliseconds, before this step fires. */
  afterMs: number;
  /** The wire event this step emits. */
  event: ToolEventPayload["event"];
  /** Optional human-readable progress line (becomes `latestMessage`). */
  message?: string;
  /**
   * A WHOLE chunk to append to the accumulating `result` string. Always a
   * complete section — never a partial / character-level fragment.
   */
  appendResult?: string;
  /** Optional structured data carried on the event (e.g. args on start). */
  data?: Record<string, unknown>;
}

/** A full timed script for one tool call. */
export interface StreamRecording {
  /** Canonical tool name (registry key), e.g. "research_web". */
  toolName: string;
  /** Optional friendly label for the lifecycle entry. */
  displayName?: string;
  /** Arguments the tool was called with (emitted on `tool_started`). */
  args: Record<string, unknown>;
  /** Ordered, timed steps. */
  steps: StreamStep[];
  /** The final, whole result delivered on `tool_completed`. */
  finalResult: unknown;
}

/**
 * Build a realistic recording for ANY tool from its final args + result.
 *
 * Most tools don't trickle — they fire, work briefly, and return their result
 * whole. Timeline: `tool_started` (data: args) → a short `tool_progress` beat
 * (so the streaming/loading state is observable) → `tool_completed` (the whole
 * result). Tune `workMs` for tools that feel slower. The result is delivered
 * whole on completion (never character-streamed) — matching the wire.
 */
export function buildSimpleRecording(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  opts?: { displayName?: string; workMs?: number; progressMessage?: string },
): StreamRecording {
  const workMs = opts?.workMs ?? 1100;
  return {
    toolName,
    displayName: opts?.displayName,
    args,
    steps: [
      { afterMs: 0, event: "tool_started", data: { ...args } },
      {
        afterMs: Math.round(workMs * 0.5),
        event: "tool_progress",
        message: opts?.progressMessage ?? "Working…",
      },
      { afterMs: workMs, event: "tool_completed" },
    ],
    finalResult: result,
  };
}

/** One parsed `## "query" (N results)` block from a research blob. */
interface ResearchSection {
  /** The query string captured from the section header. */
  query: string;
  /** The result count captured from the header (best-effort; 0 if absent). */
  count: number;
  /** The ENTIRE section text, header included, kept intact as one chunk. */
  text: string;
}

/** Matches a section header line: `## "the query" (24 results)`. */
const SECTION_HEADER = /^##\s+"([^"]*)"\s*(?:\((\d+)[^)]*\))?/;

/**
 * Split a `research_web` text blob into its query sections.
 *
 * A section starts at a `## "..."` header line and runs up to (but not
 * including) the next section header. Any leading `---` separator lines are
 * trimmed from a section's tail/head so each chunk is the clean block. Robust
 * to any number of queries, including zero (returns `[]`).
 */
function splitResearchSections(blob: string): ResearchSection[] {
  const lines = blob.split("\n");
  const sections: ResearchSection[] = [];

  let current: { query: string; count: number; bodyLines: string[] } | null =
    null;

  const flush = (): void => {
    if (!current) return;
    // Drop trailing blank / `---` separator lines so the chunk ends clean.
    const body = [...current.bodyLines];
    while (body.length > 0) {
      const last = body[body.length - 1].trim();
      if (last === "" || last === "---") body.pop();
      else break;
    }
    sections.push({
      query: current.query,
      count: current.count,
      text: body.join("\n"),
    });
    current = null;
  };

  for (const line of lines) {
    const header = SECTION_HEADER.exec(line.trim());
    if (header) {
      flush();
      current = {
        query: header[1],
        count: header[2] ? Number.parseInt(header[2], 10) : 0,
        bodyLines: [line],
      };
      continue;
    }
    if (current) current.bodyLines.push(line);
  }
  flush();

  return sections;
}

/** The slice of a blob BEFORE its first `## "..."` section header. */
function extractPreamble(blob: string): string {
  const lines = blob.split("\n");
  const preamble: string[] = [];
  for (const line of lines) {
    if (SECTION_HEADER.test(line.trim())) break;
    preamble.push(line);
  }
  // Trim trailing blank / separator lines.
  while (preamble.length > 0) {
    const last = preamble[preamble.length - 1].trim();
    if (last === "" || last === "---") preamble.pop();
    else break;
  }
  return preamble.join("\n");
}

/** Tunable cadence for how far apart query sections land. */
const SECTION_MIN_GAP_MS = 1400;
const SECTION_MAX_GAP_MS = 2400;

/**
 * Build a realistic recording for a `research_web` tool call from its final
 * text blob.
 *
 * Timeline:
 *   t=0            → `tool_started`  (data: args)
 *   staggered      → `tool_progress` per query section (whole section appended)
 *   after last gap → `tool_completed` (finalResult = the full blob)
 *
 * The first progress step also re-emits the preamble (intro + "All Search
 * Results" header + the "Searched:" summary line) so the renderer's
 * accumulating string matches the real wire order: preamble first, then the
 * first section. Each subsequent progress step appends exactly one whole
 * section. The accumulated progress text is therefore the full blob by the
 * final section, and `tool_completed` then swaps in the canonical `finalResult`.
 */
export function buildResearchRecording(
  fullBlob: string,
  args: Record<string, unknown>,
): StreamRecording {
  const preamble = extractPreamble(fullBlob);
  const sections = splitResearchSections(fullBlob);

  const steps: StreamStep[] = [
    { afterMs: 0, event: "tool_started", data: { ...args } },
  ];

  // Deterministic-ish stagger across the min/max gap band, scaling with the
  // section index so later sections feel like they're still trickling in.
  const gapFor = (index: number): number => {
    if (sections.length <= 1) return SECTION_MIN_GAP_MS;
    const ratio = index / (sections.length - 1); // 0 → 1 across sections
    return Math.round(
      SECTION_MIN_GAP_MS + ratio * (SECTION_MAX_GAP_MS - SECTION_MIN_GAP_MS),
    );
  };

  let elapsed = 600; // small lead-in before the first section lands
  sections.forEach((section, index) => {
    elapsed += gapFor(index);
    const isFirst = index === 0;
    // First section carries the preamble ahead of it so accumulated text
    // matches real wire order; later sections append their block alone.
    const appendResult =
      isFirst && preamble.length > 0
        ? `${preamble}\n\n${section.text}`
        : section.text;
    steps.push({
      afterMs: elapsed,
      event: "tool_progress",
      message: `Searched "${section.query}" (${section.count})`,
      appendResult,
    });
  });

  // Final completion lands one more gap after the last section.
  elapsed += gapFor(sections.length);
  steps.push({
    afterMs: elapsed,
    event: "tool_completed",
  });

  return {
    toolName: "research_web",
    displayName: "Deep Research",
    args,
    steps,
    finalResult: fullBlob,
  };
}

/** Search cadence — snappier than deep research; parallel queries land fast. */
const SEARCH_MIN_GAP_MS = 900;
const SEARCH_MAX_GAP_MS = 1600;

/**
 * Build a realistic recording for a web-search tool call (`web_search`,
 * `core_web_search`, `web_search_v1`) from its final text blob.
 *
 * Mirrors `buildResearchRecording` but with a faster, search-engine-like
 * cadence: each parallel query's result SECTION lands as one whole part over
 * time (the wire delivers whole sections, never a char trickle), so the
 * SearchInline renderer's rolling-window conveyor reveals them a few at a time
 * and fast-forwards to the persistent Google-class view when the next lands /
 * the tool completes.
 *
 * The first progress step re-emits the preamble (intro + "All Search Results" +
 * the "Searched:" summary) ahead of the first section so the accumulating text
 * matches real wire order. `tool_completed` then swaps in the canonical blob.
 */
export function buildSearchRecording(
  fullBlob: string,
  args: Record<string, unknown>,
  opts?: { toolName?: string; displayName?: string },
): StreamRecording {
  const toolName = opts?.toolName ?? "web_search";
  const displayName = opts?.displayName ?? "Web Search";
  const preamble = extractPreamble(fullBlob);
  const sections = splitResearchSections(fullBlob);

  const steps: StreamStep[] = [
    { afterMs: 0, event: "tool_started", data: { ...args } },
  ];

  const gapFor = (index: number): number => {
    if (sections.length <= 1) return SEARCH_MIN_GAP_MS;
    const ratio = index / (sections.length - 1);
    return Math.round(
      SEARCH_MIN_GAP_MS + ratio * (SEARCH_MAX_GAP_MS - SEARCH_MIN_GAP_MS),
    );
  };

  let elapsed = 400; // small lead-in before the first section lands
  sections.forEach((section, index) => {
    elapsed += gapFor(index);
    const isFirst = index === 0;
    const appendResult =
      isFirst && preamble.length > 0
        ? `${preamble}\n\n${section.text}`
        : section.text;
    steps.push({
      afterMs: elapsed,
      event: "tool_progress",
      message: `Searched "${section.query}" (${section.count})`,
      appendResult,
    });
  });

  elapsed += gapFor(sections.length);
  steps.push({ afterMs: elapsed, event: "tool_completed" });

  return { toolName, displayName, args, steps, finalResult: fullBlob };
}

// ─────────────────────────────────────────────────────────────────────────────
// Scrape / page-read recording (web_read, core_web_read_web_pages)
// ─────────────────────────────────────────────────────────────────────────────

/** Reading a page takes real time — pages start a beat apart, finish slow. */
const READ_START_GAP_MS = 500;
const READ_WORK_MS = 2600;

/**
 * Build a realistic recording for a page-read tool call (`web_read`,
 * `core_web_read_web_pages`) from its final result object.
 *
 * The wire reality: the read tools return the FULL `{ pages: [...] }` object
 * WHOLE at `tool_completed` — they do NOT trickle page bodies. What DOES stream
 * is the per-URL browsing ACTIVITY: a `tool_progress` "Browsing <url>" beat as
 * each page begins fetching. So this recording emits:
 *
 *   t=0          → `tool_started`  (data: { urls })
 *   staggered    → `tool_progress` "Browsing <url>" per page (drives the
 *                  left-to-right reading-wave card to appear for that page)
 *   after work   → `tool_completed` (finalResult = the whole pages object)
 *
 * The ScrapeInline renderer reading-waves each browsing URL while the call is
 * live, then fills in every page card the instant `tool_completed` lands.
 *
 * `result` must be the page-read object (`{ pages: [{ url, content, … }] }`);
 * the requested URLs are read from `result.pages[*].url` (falling back to
 * `args.urls`) so the browsing beats line up with the pages that come back.
 */
export function buildScrapeRecording(
  result: { pages?: Array<{ url?: string }> } | Record<string, unknown>,
  args: Record<string, unknown>,
  opts?: { toolName?: string; displayName?: string },
): StreamRecording {
  const toolName = opts?.toolName ?? "web_read";
  const displayName = opts?.displayName ?? "Web Page Reader";

  const pages = Array.isArray((result as { pages?: unknown }).pages)
    ? ((result as { pages: Array<{ url?: string }> }).pages)
    : [];
  const urlsFromPages = pages
    .map((p) => (typeof p.url === "string" ? p.url : ""))
    .filter(Boolean);
  const urlsFromArgs = Array.isArray(args.urls)
    ? (args.urls as unknown[]).filter(
        (u): u is string => typeof u === "string" && u.length > 0,
      )
    : [];
  const urls = urlsFromPages.length > 0 ? urlsFromPages : urlsFromArgs;

  const steps: StreamStep[] = [
    { afterMs: 0, event: "tool_started", data: { ...args } },
  ];

  // Each page begins reading a short beat after the previous — the cards appear
  // staggered, each running its own reading-wave until completion.
  let lastStart = 0;
  urls.forEach((url, index) => {
    lastStart = READ_START_GAP_MS * (index + 1);
    steps.push({
      afterMs: lastStart,
      event: "tool_progress",
      message: `Browsing ${url}`,
    });
  });

  // Completion lands after the slowest page finishes its read window.
  const completeAt =
    (urls.length > 0 ? lastStart : 0) + READ_WORK_MS;
  steps.push({ afterMs: completeAt, event: "tool_completed" });

  return { toolName, displayName, args, steps, finalResult: result };
}
