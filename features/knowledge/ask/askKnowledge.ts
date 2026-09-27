/**
 * features/knowledge/ask/askKnowledge.ts — the client for Ask mode:
 * `POST /knowledge/search` with `mode: "ask"` (KNOWLEDGE-HUB.md §5.3, H4).
 *
 * The same query object the search takes, plus `sources_used` — per-Source
 * on/off keyed by Source id (NotebookLM: include/exclude a Source for this
 * question). The server streams, in order:
 *
 *   ask_started → answer_delta… (answer_reset) → citations → sources_used → ask_done
 *   — or ask_refused (monthly cap reached / no organization chosen)
 *
 * Ask SPENDS against one organization, so unlike the find-search this is not a
 * body-carried read: `postNdjson` names the selected organization and refuses
 * before sending when none is selected (and the server refuses the same way).
 *
 * `adaptAskEvent` is the only code that knows the wire shape; flip it to the
 * generated `components["schemas"]` types when `pnpm sync-types` carries them.
 */

import { postNdjson } from "@/lib/python-client";
import { describeBackendFailure } from "@/lib/api/errors";
import type { TypedStreamEvent } from "@/lib/api/types";
import {
  KNOWLEDGE_SEARCH_PATH,
  type KnowledgeQuery,
} from "@/features/knowledge/api/knowledgeSearch";

export const NOT_FOUND_SENTENCE = "I could not find this in your knowledge.";

export interface AskCitation {
  number: number;
  segment_id: string;
  source_id: string;
  source_title?: string | null;
  source_kind?: string | null;
  locator?: string | null;
  page_numbers?: number[];
  quote: string;
}

export interface AskSourceUsed {
  source_id: string;
  title: string;
  source_kind?: string | null;
  on: boolean;
  segments: number;
  cited: boolean;
}

export type AskEvent =
  | { type: "ask_started"; notes: string[] }
  | { type: "answer_delta"; text: string }
  | { type: "answer_reset" }
  | { type: "citations"; citations: AskCitation[]; uncited_sentences: string[] }
  | { type: "sources_used"; items: AskSourceUsed[]; note: string | null }
  | {
      type: "ask_done";
      answer: string;
      found: boolean;
      model: string | null;
    }
  | {
      type: "ask_refused";
      reason: "cap_reached" | "no_organization";
      message: string;
    }
  | { type: "ask_error"; message: string };

export interface AskRequest {
  query: KnowledgeQuery;
  /** Per-Source on/off; a Source absent from the map is used. */
  sourcesUsed?: Record<string, boolean>;
}

export type AskRunner = (
  request: AskRequest,
  onEvent: (event: AskEvent) => void,
  signal?: AbortSignal,
) => Promise<void>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function adaptCitation(raw: unknown): AskCitation | null {
  if (!isRecord(raw)) return null;
  const number = typeof raw.number === "number" ? raw.number : null;
  const segment_id = str(raw.segment_id);
  const source_id = str(raw.source_id);
  if (number === null || !segment_id || !source_id) return null;
  return {
    number,
    segment_id,
    source_id,
    source_title: str(raw.source_title),
    source_kind: str(raw.source_kind),
    locator: str(raw.locator),
    page_numbers: Array.isArray(raw.page_numbers)
      ? raw.page_numbers.filter((n): n is number => typeof n === "number")
      : [],
    quote: typeof raw.quote === "string" ? raw.quote : "",
  };
}

function adaptSource(raw: unknown): AskSourceUsed | null {
  if (!isRecord(raw)) return null;
  const source_id = str(raw.source_id);
  if (!source_id) return null;
  return {
    source_id,
    title: str(raw.title) ?? "Untitled",
    source_kind: str(raw.source_kind),
    on: raw.on !== false,
    segments: typeof raw.segments === "number" ? raw.segments : 0,
    cited: raw.cited === true,
  };
}

/** One wire event → one client event, or null for anything no surface renders. */
export function adaptAskEvent(evt: TypedStreamEvent): AskEvent | null {
  if (evt.event === "error") {
    const data: unknown = evt.data;
    return {
      type: "ask_error",
      message:
        (isRecord(data) && (str(data.user_message) ?? str(data.message))) ||
        "The answer stopped before it finished.",
    };
  }
  if (evt.event !== "data") return null;
  const data: unknown = evt.data;
  if (!isRecord(data)) return null;
  switch (data.type) {
    case "ask_started":
      return { type: "ask_started", notes: strList(data.notes) };
    case "answer_delta":
      return typeof data.text === "string" ? { type: "answer_delta", text: data.text } : null;
    case "answer_reset":
      return { type: "answer_reset" };
    case "citations":
      return {
        type: "citations",
        citations: Array.isArray(data.citations)
          ? data.citations.map(adaptCitation).filter((c): c is AskCitation => c !== null)
          : [],
        uncited_sentences: strList(data.uncited_sentences),
      };
    case "sources_used":
      return {
        type: "sources_used",
        items: Array.isArray(data.items)
          ? data.items.map(adaptSource).filter((s): s is AskSourceUsed => s !== null)
          : [],
        note: str(data.note),
      };
    case "ask_done":
      return {
        type: "ask_done",
        answer: typeof data.answer === "string" ? data.answer : "",
        found: data.found === true,
        model: str(data.model),
      };
    case "ask_refused":
      return {
        type: "ask_refused",
        reason: data.reason === "no_organization" ? "no_organization" : "cap_reached",
        message: str(data.message) ?? "Ask could not run.",
      };
    default:
      return null;
  }
}

/** The request body: the query object itself in ask mode, plus the on/off map. */
export function toAskRequest(request: AskRequest) {
  const { cursors: _cursors, ...query } = request.query;
  return {
    ...query,
    mode: "ask" as const,
    as_you_type: false,
    ...(request.sourcesUsed && Object.keys(request.sourcesUsed).length
      ? { sources_used: request.sourcesUsed }
      : {}),
  };
}

/** The real runner. Every failure becomes an `ask_error` event — never a blank panel. */
export const askKnowledge: AskRunner = async (request, onEvent, signal) => {
  try {
    const stream = postNdjson(KNOWLEDGE_SEARCH_PATH, toAskRequest(request), { signal });
    for await (const evt of stream) {
      const adapted = adaptAskEvent(evt);
      if (adapted) onEvent(adapted);
    }
  } catch (err) {
    if (signal?.aborted) return;
    onEvent({ type: "ask_error", message: describeBackendFailure(err).headline });
  }
};

/** Where a citation opens: its Source, at that Segment. */
export function citationHref(c: Pick<AskCitation, "source_id" | "segment_id">): string {
  return `/knowledge/sources/${encodeURIComponent(c.source_id)}?chunk=${encodeURIComponent(c.segment_id)}`;
}

// ─── Answer text → sentences and citation markers ───────────────────────────

export type AnswerToken =
  | { kind: "text"; text: string }
  | { kind: "cite"; numbers: number[]; raw: string };

/** `[1]`, `[S1]`, `[S1, S3]` — the server labels contexts `S<n>`; both spellings cite n. */
const MARKER_RE = /\[(S?\d+(?:\s*[,;]\s*S?\d+)*)\]/g;
/** Same shape as the server's sentence split (ask.py `_SENTENCE_RE`). */
const SENTENCE_RE = /[^.!?\n]+(?:[.!?]+(?:\s*\[[S\d,;\s]+\])*|$)/g;

export function tokenizeAnswer(text: string): AnswerToken[] {
  const out: AnswerToken[] = [];
  let last = 0;
  for (const m of text.matchAll(MARKER_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    out.push({
      kind: "cite",
      raw: m[0],
      numbers: m[1].split(/[,;]/).map((n) => Number(n.trim().replace(/^S/, ""))),
    });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** Lines → sentences, each keeping trailing markers, as the server splits them. */
export function splitAnswerSentences(line: string): string[] {
  return Array.from(line.matchAll(SENTENCE_RE), (m) => m[0]).filter((s) => s.trim().length > 0);
}

