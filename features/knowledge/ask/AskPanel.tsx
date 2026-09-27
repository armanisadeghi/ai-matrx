"use client";

/**
 * AskPanel — Ask mode, docked right (KNOWLEDGE-HUB.md §5.3, H4). Champion:
 * NotebookLM — the answer stands only on your Sources, every claim carries a
 * numbered citation, a citation opens the Source at that exact passage, and a
 * checkbox list shows (and lets you change) exactly which Sources the answer
 * may draw from.
 *
 * Dock it anywhere: the hub passes its current query and its `sources` section;
 * given no sources, the panel reads the filter's `sources` section itself
 * through the one search client. A citation click goes to `onOpenCitation`
 * (the hub's peek) when given, else opens the Source in a new tab — it is a
 * real link either way, so ⌘-click and "copy link" work.
 *
 * Honest states: nothing in the filter → says so before anything is spent;
 * the organization's monthly cap reached → the knob's own sentence; an answer
 * the server could not ground → "I could not find this in your knowledge.";
 * a sentence with no citation → marked "no citation" in place.
 */

import { useEffect, useRef, useState } from "react";
import { ExternalLink, MessageSquareQuote, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { LoadingSpinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  searchKnowledge,
  type KnowledgeHit,
  type KnowledgeQuery,
  type KnowledgeSearchRunner,
} from "@/features/knowledge/api/knowledgeSearch";
import {
  askKnowledge,
  citationHref,
  splitAnswerSentences,
  tokenizeAnswer,
  type AskCitation,
  type AskRunner,
  type AskSourceUsed,
} from "@/features/knowledge/ask/askKnowledge";

export interface AskPanelProps {
  /** The current filter. Its `text` pre-fills the question. */
  query: KnowledgeQuery;
  /** The current filter's `sources` section; omitted → the panel reads it. */
  sources?: KnowledgeHit[] | null;
  onClose?: () => void;
  /** Open a citation in place (the hub's peek). Omitted → a new tab. */
  onOpenCitation?: (citation: AskCitation, href: string) => void;
  className?: string;
  /** Test seams — the real clients by default. */
  runAsk?: AskRunner;
  runSearch?: KnowledgeSearchRunner;
}

type SourcesState =
  | { status: "loading" }
  | { status: "ready"; items: KnowledgeHit[] }
  | { status: "error"; message: string };

type Phase =
  | { kind: "idle" }
  | { kind: "asking" }
  | { kind: "done"; found: boolean }
  | { kind: "refused"; message: string }
  | { kind: "error"; message: string };

function sourcesFromProps(sources: KnowledgeHit[] | null | undefined): SourcesState | null {
  return sources ? { status: "ready", items: sources } : null;
}

export function AskPanel({
  query,
  sources,
  onClose,
  onOpenCitation,
  className,
  runAsk = askKnowledge,
  runSearch = searchKnowledge,
}: AskPanelProps) {
  const [question, setQuestion] = useState(query.text ?? "");
  const [loaded, setLoaded] = useState<SourcesState>({ status: "loading" });
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [answer, setAnswer] = useState("");
  const [citations, setCitations] = useState<AskCitation[]>([]);
  const [uncited, setUncited] = useState<string[]>([]);
  const [used, setUsed] = useState<AskSourceUsed[] | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  const { text: _text, mode: _mode, cursors: _cursors, ...filter } = query;
  const filterKey = JSON.stringify(filter);
  const given = sourcesFromProps(sources);

  // The filter's Sources, when the host did not hand them over. The filter
  // (not the typed question) decides which Sources are in play.
  useEffect(() => {
    if (sources) return;
    const ctl = new AbortController();
    setLoaded({ status: "loading" });
    const current = JSON.parse(filterKey) as KnowledgeQuery;
    runSearch(
      { ...current, mode: "find", types: current.types?.length ? current.types : ["processed_document"] },
      { signal: ctl.signal },
    )
      .then((sections) => {
        const section = sections.find((s) => s.key === "sources");
        if (section?.error) setLoaded({ status: "error", message: section.error.message });
        else setLoaded({ status: "ready", items: section?.items ?? [] });
      })
      .catch((err: unknown) => {
        if (ctl.signal.aborted) return;
        setLoaded({
          status: "error",
          message: err instanceof Error ? err.message : "The Sources in this filter could not be read.",
        });
      });
    return () => ctl.abort();
  }, [filterKey, sources, runSearch]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const state = given ?? loaded;
  const items = state.status === "ready" ? state.items : [];
  const onCount = items.filter((s) => toggles[s.id] !== false).length;
  const noSources = state.status === "ready" && items.length === 0;

  const ask = async () => {
    const text = question.trim();
    if (!text || phase.kind === "asking") return;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    setAnswer("");
    setCitations([]);
    setUncited([]);
    setUsed(null);
    setNotes([]);
    setPhase({ kind: "asking" });
    let settled = false;
    await runAsk(
      { query: { ...query, text, mode: "ask" }, sourcesUsed: toggles },
      (evt) => {
        switch (evt.type) {
          case "ask_started":
            setNotes(evt.notes);
            break;
          case "answer_delta":
            setAnswer((a) => a + evt.text);
            break;
          case "answer_reset":
            setAnswer("");
            break;
          case "citations":
            setCitations(evt.citations);
            setUncited(evt.uncited_sentences);
            break;
          case "sources_used":
            setUsed(evt.items);
            if (evt.note) setNotes((n) => [...n, evt.note as string]);
            break;
          case "ask_done":
            settled = true;
            setAnswer(evt.answer);
            setPhase({ kind: "done", found: evt.found });
            break;
          case "ask_refused":
            settled = true;
            setPhase({ kind: "refused", message: evt.message });
            break;
          case "ask_error":
            settled = true;
            setPhase({ kind: "error", message: evt.message });
            break;
        }
      },
      ctl.signal,
    );
    if (!settled && !ctl.signal.aborted) {
      setPhase({ kind: "error", message: "The answer stopped before it finished. Ask again to retry." });
    }
  };

  const byNumber = new Map(citations.map((c) => [c.number, c]));
  const plain = (s: string) => s.replace(/\*\*|__/g, "").trim();
  const uncitedSet = new Set(uncited.map(plain));

  const openCitation = (e: React.MouseEvent, c: AskCitation) => {
    if (!onOpenCitation || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    onOpenCitation(c, citationHref(c));
  };

  return (
    <aside
      aria-label="Ask your knowledge"
      className={cn("flex h-full min-h-0 flex-col border-l border-border bg-card", className)}
    >
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MessageSquareQuote className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Ask</h2>
        <span className="text-xs text-muted-foreground">Answers only from your Sources, with citations</span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ask"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <form
          className="space-y-2 border-b border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <Textarea
            aria-label="Your question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                void ask();
              }
            }}
            placeholder="Ask a question your Sources can answer"
            rows={2}
            className="resize-none text-sm"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {state.status === "ready"
                ? `Using ${onCount} of ${items.length} Source${items.length === 1 ? "" : "s"}`
                : state.status === "loading"
                  ? "Reading the Sources in this filter"
                  : ""}
            </span>
            <Button
              type="submit"
              size="sm"
              className="ml-auto"
              disabled={!question.trim() || phase.kind === "asking" || noSources || onCount === 0}
            >
              {phase.kind === "asking" ? "Answering" : "Ask"}
            </Button>
          </div>
        </form>

        <section aria-label="Sources this answer may use" className="border-b border-border p-3">
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Sources</h3>
          {state.status === "loading" && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoadingSpinner size="sm" /> Reading the Sources in this filter
            </div>
          )}
          {state.status === "error" && (
            <p role="alert" className="text-xs text-destructive">
              {state.message}
            </p>
          )}
          {noSources && (
            <p className="text-xs text-muted-foreground" data-testid="ask-no-sources">
              No Sources match the current filter, so there is nothing to answer from. Widen the filter, or capture a
              page or upload a file first.
            </p>
          )}
          {state.status === "ready" && items.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {items.map((s) => {
                const info = used?.find((u) => u.source_id === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`ask-src-${s.id}`}
                      checked={toggles[s.id] !== false}
                      onCheckedChange={(v) => setToggles((t) => ({ ...t, [s.id]: v === true }))}
                      aria-label={`Use ${s.title}`}
                    />
                    <label htmlFor={`ask-src-${s.id}`} className="min-w-0 flex-1 truncate">
                      {s.title}
                    </label>
                    {info?.cited && <span className="text-[10px] font-medium text-primary">cited</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Answer" aria-live="polite" className="flex-1 p-3">
          {phase.kind === "idle" && !noSources && (
            <p className="text-xs text-muted-foreground">
              Ask a question. Every sentence of the answer points to the passage it came from.
            </p>
          )}
          {phase.kind === "asking" && !answer && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoadingSpinner size="sm" /> Reading your Sources
            </div>
          )}
          {phase.kind === "refused" && (
            <p role="alert" data-testid="ask-refused" className="rounded-md bg-muted p-2 text-sm">
              {phase.message}
            </p>
          )}
          {phase.kind === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {phase.message}
            </p>
          )}
          {answer && (
            <div data-testid="ask-answer" className="space-y-2 text-sm leading-relaxed">
              {answer.split("\n").map((raw, li) => {
                const heading = /^\s*#{1,6}\s+/.test(raw);
                const line = raw.replace(/^\s*#{1,6}\s+/, "").replace(/\*\*|__/g, "");
                return line.trim() ? (
                  <p key={li} className={cn(heading && "font-semibold text-foreground")}>
                    {splitAnswerSentences(line).map((sentence, si) => (
                      <span key={si}>
                        {tokenizeAnswer(sentence).map((tok, ti) =>
                          tok.kind === "text" ? (
                            <span key={ti}>{tok.text}</span>
                          ) : (
                            <sup key={ti} className="mx-0.5 space-x-0.5">
                              {tok.numbers.map((n) => {
                                const c = byNumber.get(n);
                                return c ? (
                                  <a
                                    key={n}
                                    href={citationHref(c)}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => openCitation(e, c)}
                                    title={`${c.source_title ?? "Source"}${c.locator ? `, ${c.locator}` : ""}: ${c.quote}`}
                                    aria-label={`Citation ${n}: ${c.source_title ?? "Source"}`}
                                    className="rounded bg-primary/10 px-1 font-medium text-primary hover:bg-primary/20"
                                  >
                                    {n}
                                  </a>
                                ) : (
                                  <span key={n} className="px-0.5 text-muted-foreground">
                                    {n}
                                  </span>
                                );
                              })}
                            </sup>
                          ),
                        )}
                        {phase.kind === "done" && uncitedSet.has(plain(sentence)) && (
                          <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                            no citation
                          </span>
                        )}
                      </span>
                    ))}
                  </p>
                ) : null;
              })}
            </div>
          )}
          {citations.length > 0 && (
            <ol aria-label="Citations" className="mt-4 space-y-2 border-t border-border pt-3">
              {citations.map((c) => (
                <li key={c.number} className="text-xs">
                  <a
                    href={citationHref(c)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => openCitation(e, c)}
                    className="group flex gap-2 rounded-md p-1.5 hover:bg-muted"
                  >
                    <span className="font-semibold text-primary">{c.number}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1 font-medium text-foreground">
                        <span className="truncate">{c.source_title ?? "Source"}</span>
                        {c.locator && <span className="text-muted-foreground">· {c.locator}</span>}
                        <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100" />
                      </span>
                      <span className="line-clamp-3 text-muted-foreground">{c.quote}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          )}
          {notes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

export default AskPanel;
