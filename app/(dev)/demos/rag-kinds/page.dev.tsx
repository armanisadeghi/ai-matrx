"use client";

/**
 * RAG Kinds Run — Stage B live demo (data-to-kinds queue row 3).
 *
 * ZERO mocks, zero pasted fixtures. It calls the REAL aidream endpoint
 * (`POST /api/rag-kinds/search`), which runs the ACTUAL retrieval engine the
 * RAG nodes use over the signed-in caller's own corpus, translates the result
 * through the adapter, and streams back FOUR things: the kind, the citation the
 * LIVE node builds from the identical hits, the translation report (every
 * dropped value with its real content), and — when asked — a REAL grounded
 * answer over those same hits. Everything renders through `KindInstanceRender`,
 * the production route path, not through a component this page imports.
 *
 * THREE TABS, AND THE THIRD IS NON-NEGOTIABLE:
 *
 *  1. RESULTS — the passages as `retrieved_chunk`, each carrying its
 *     `source_ref`, plus the retrieval diagnostics nobody could see before. Tick
 *     "grounded answer" and the `rag_synthesize_result` renders above them with
 *     its `citations` as real, openable sources.
 *  2. WHAT THE LIVE CITATION LOSES — the `legacy` block beside ours, from the
 *     SAME hits. Measured live 2026-08-24: our adapter produced 6/6 sources with
 *     a short code and an openable URL; the live builder produced 0/6, and
 *     `legacy.lost` names the five fields it drops. This tab IS the evidence for
 *     the Stage D repair — when that repair lands, this panel goes quiet. If it
 *     does not go quiet, the repair did not land.
 *  3. WHAT WE HIDE — THE SHOW-WHAT-YOU-HIDE LAW (Arman, 2026-08-23):
 *     *"on anything at all that you choose to remove or ignore… you have to
 *     render them for me in a separate tab so that I can see exactly what we
 *     are hiding from the user."* Every dropped value with its path, reason,
 *     honest size and preview. Unknown keys are a RED banner: the adapter
 *     claimed neither register, and one of OUR OWN pipelines writing a field no
 *     consumer knows about is more serious than a provider doing it, not less.
 */

import { useState } from "react";
import {
  AlertTriangle,
  BookOpenText,
  EyeOff,
  Play,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";

// ── wire readers (defensive; the server owns the shapes) ────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

interface DroppedRow {
  path: string;
  reason: string;
  kindOf: string;
  size: number | null;
  preview: unknown;
}
interface UnknownRow {
  section: string;
  keys: string[];
}
interface Report {
  provider: string;
  unknown: UnknownRow[];
  dropped: DroppedRow[];
}
interface Legacy {
  citations: Record<string, unknown>[];
  withShortCode: number;
  withUrl: number;
  total: number;
  lost: string[];
}
interface Outcome {
  result: Record<string, unknown>;
  legacy: Legacy | null;
  translation: Report | null;
  synthesis: Record<string, unknown> | null;
}

function readReport(v: unknown): Report | null {
  if (!isRecord(v) || typeof v.provider !== "string") return null;
  const unknown: UnknownRow[] = Array.isArray(v.unknown)
    ? v.unknown.flatMap((u) =>
        isRecord(u) && typeof u.section === "string" && Array.isArray(u.keys)
          ? [{ section: u.section, keys: u.keys.map(String) }]
          : [],
      )
    : [];
  const dropped: DroppedRow[] = Array.isArray(v.dropped)
    ? v.dropped.flatMap((d) =>
        isRecord(d) && typeof d.path === "string"
          ? [
              {
                path: d.path,
                reason: str(d.reason) ?? "(no reason recorded)",
                kindOf: str(d.kind_of) ?? "?",
                size: int(d.size),
                preview: d.preview,
              },
            ]
          : [],
      )
    : [];
  return { provider: v.provider, unknown, dropped };
}

function readLegacy(v: unknown): Legacy | null {
  if (!isRecord(v)) return null;
  return {
    citations: Array.isArray(v.citations) ? v.citations.filter(isRecord) : [],
    withShortCode: int(v.with_short_code) ?? 0,
    withUrl: int(v.with_url) ?? 0,
    total: int(v.total) ?? 0,
    lost: Array.isArray(v.lost) ? v.lost.map(String) : [],
  };
}

/** What OUR shape recovered on this very search — the other half of the count. */
function kindSourceStats(result: Record<string, unknown>): {
  total: number;
  withShortCode: number;
  withUrl: number;
} {
  const hits = Array.isArray(result.hits) ? result.hits.filter(isRecord) : [];
  let withShortCode = 0;
  let withUrl = 0;
  for (const hit of hits) {
    const source = isRecord(hit.source) ? hit.source : null;
    if (!source) continue;
    if (str(source.short_code)) withShortCode += 1;
    if (str(source.url)) withUrl += 1;
  }
  return { total: hits.length, withShortCode, withUrl };
}

// ── page ───────────────────────────────────────────────────────────────────

export default function RagKindsDemoPage() {
  const { post } = useBackendApi();
  const [query, setQuery] = useState(
    "What are the containment steps during an incident response?",
  );
  const [synthesize, setSynthesize] = useState(false);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async () => {
    if (phase === "running" || query.trim() === "") return;
    setPhase("running");
    setOutcome(null);
    try {
      const response = await post("/rag-kinds/search", {
        query: query.trim(),
        limit: 8,
        synthesize,
      });
      let received: Outcome | null = null;
      await consumeStream(response, {
        onData: (data) => {
          if (
            isRecord(data) &&
            data.type === "rag_kinds_result" &&
            isRecord(data.result)
          ) {
            received = {
              result: data.result,
              legacy: readLegacy(data.legacy),
              translation: readReport(data.translation),
              synthesis: isRecord(data.synthesis) ? data.synthesis : null,
            };
          }
        },
        onError: (e) => {
          throw new Error(e.user_message || e.message || "The search failed.");
        },
      });
      if (!received) {
        throw new Error("The stream ended without a rag_kinds_result event.");
      }
      setOutcome(received);
      setPhase("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The search failed.");
      setPhase(outcome ? "done" : "idle");
    }
  };

  const report = outcome?.translation ?? null;
  const legacy = outcome?.legacy ?? null;
  const ours = outcome ? kindSourceStats(outcome.result) : null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          RAG Kinds — live retrieval demo
        </h1>
        <p className="text-sm text-muted-foreground">
          A real knowledge-base search over YOUR corpus, through the same engine
          the <code className="text-xs">rag.search</code> node uses, translated
          into the retrieval + citation kind family and rendered entirely through
          the registered kind components. Every passage is a{" "}
          <code className="text-xs">retrieved_chunk</code>; every source under it
          is the system-wide <code className="text-xs">source_ref</code> —
          openable, with its short code, its version and whether it is still in
          force. No mocks.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask your knowledge base something"
          className="min-w-64 flex-1"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="synthesize"
            checked={synthesize}
            onCheckedChange={(checked) => setSynthesize(checked === true)}
          />
          <Label htmlFor="synthesize" className="text-sm text-muted-foreground">
            Also write a grounded answer (spends model tokens)
          </Label>
        </div>
        <Button type="submit" disabled={phase === "running"}>
          <Play className="mr-1.5 h-4 w-4" />
          Search
        </Button>
      </form>

      {phase === "running" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Retrieval engine → translation adapter → kind
          {synthesize ? " → grounded answer" : ""}…
        </div>
      )}

      {outcome && (
        <Tabs defaultValue="results" className="w-full">
          <TabsList>
            <TabsTrigger value="results">
              <BookOpenText className="mr-1.5 h-4 w-4" />
              Results
            </TabsTrigger>
            <TabsTrigger value="legacy">
              <Scale className="mr-1.5 h-4 w-4" />
              What the live citation loses
              {legacy && legacy.lost.length > 0 && (
                <span className="ml-1.5 rounded-full bg-destructive/15 px-1.5 text-[10px] text-destructive">
                  {legacy.lost.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="hidden">
              <EyeOff className="mr-1.5 h-4 w-4" />
              What we hide
              {report && report.dropped.length > 0 && (
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px]">
                  {report.dropped.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── 1. The retrieval as kinds ─────────────────────────────────── */}
          <TabsContent value="results" className="space-y-3">
            {outcome.synthesis && (
              <div className="rounded-lg border border-border bg-textured p-3">
                <KindInstanceRender
                  kind="rag_synthesize_result"
                  value={outcome.synthesis}
                />
              </div>
            )}
            {synthesize && !outcome.synthesis && (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                No grounded answer was written — the search returned nothing to
                ground one on. An honest absence beats an invented answer.
              </p>
            )}
            <KindInstanceRender
              kind="rag_search_result"
              value={outcome.result}
              showRoutingNote
            />
          </TabsContent>

          {/* ── 2. The finding this run makes ─────────────────────────────── */}
          <TabsContent value="legacy" className="space-y-3">
            {!legacy ? (
              <p className="text-sm text-muted-foreground">
                The server returned no legacy projection for this search.
              </p>
            ) : (
              <>
                <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    Same hits, both columns.
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The right column is{" "}
                    <code>graph_actions/rag/_shared.py::_hit_to_citation</code> —
                    what every RAG node emits today — run over the exact hits the
                    left column carries. It reads{" "}
                    <code>sm.get(&quot;library_short_code&quot;)</code>; the real
                    key is <code>short_code</code>. It never reads the URL at
                    all, so a citation it produces cannot be opened by the person
                    reading it. Nothing here is fixed in the live emitter — the
                    repair rides Stage D, so the node is edited exactly once.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Property</th>
                        <th className="px-3 py-2 text-right">
                          Carried by the kind (source_ref)
                        </th>
                        <th className="px-3 py-2 text-right">
                          Produced by the live node today
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-border">
                        <td className="px-3 py-1.5 font-medium text-foreground">
                          Sources
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {ours?.total ?? 0}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {legacy.total}
                        </td>
                      </tr>
                      <tr className="border-t border-border bg-destructive/5">
                        <td className="px-3 py-1.5 font-medium text-foreground">
                          …with a short code
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {ours?.withShortCode ?? 0}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-destructive">
                          {legacy.withShortCode}
                        </td>
                      </tr>
                      <tr className="border-t border-border bg-destructive/5">
                        <td className="px-3 py-1.5 font-medium text-foreground">
                          …with an openable URL
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                          {ours?.withUrl ?? 0}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-destructive">
                          {legacy.withUrl}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {legacy.lost.length > 0 ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                    <div className="font-medium text-foreground">
                      Fields present in the retrieval and absent from every live
                      citation on this search:
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {legacy.lost.map((field) => (
                        <code
                          key={field}
                          className="rounded border border-destructive/40 bg-background px-1.5 py-0.5 text-xs text-destructive"
                        >
                          {field}
                        </code>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-success" />
                    Nothing lost on this search. Either the Stage D repair has
                    landed, or this corpus carries none of the provenance fields
                    — check the counts above before concluding the first.
                  </div>
                )}

                <details className="rounded-md border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
                    The {legacy.citations.length} citations exactly as the live
                    node builds them
                  </summary>
                  <pre className="max-h-96 overflow-auto px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(legacy.citations, null, 2)}
                  </pre>
                </details>
              </>
            )}
          </TabsContent>

          {/* ── 3. THE SHOW-WHAT-YOU-HIDE LAW ───────────────────────────── */}
          <TabsContent value="hidden" className="space-y-3">
            {report && report.unknown.length > 0 && (
              <div className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  UNKNOWN KEYS — the adapter claims neither MAPPED nor DROPPED
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  This source is OUR OWN engine, which makes an unregistered key
                  more serious, not less: one of our ingestion pipelines is
                  writing data no consumer knows exists. Add each key to a
                  register in{" "}
                  <code>aidream/services/rag_kinds/rag_adapter.py</code>, with a
                  reason.
                </p>
                <ul className="mt-1 list-disc pl-6 text-xs text-foreground">
                  {report.unknown.map((u, i) => (
                    <li key={i}>
                      <span className="font-medium">{u.section}</span>:{" "}
                      {u.keys.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report && report.unknown.length === 0 && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-success" />
                Fully accounted — every key in the retrieval payload is MAPPED or
                DROPPED in the adapter&apos;s registers. No unknowns.
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Everything below is present in the payload and deliberately NOT
              carried by the kind — with its real value, so the question
              &ldquo;should this be dropped?&rdquo; can be answered by looking
              rather than by trusting a list of key names.
            </p>

            {!report || report.dropped.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                Nothing was dropped from this payload.
              </p>
            ) : (
              <div className="space-y-2">
                {report.dropped.map((d, i) => (
                  <div
                    key={`${d.path}-${i}`}
                    className="rounded-md border border-border bg-card p-3"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <code className="text-sm font-medium text-foreground">
                        {d.path}
                      </code>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {d.kindOf}
                      </span>
                      {d.size !== null && (
                        <span className="text-[11px] text-muted-foreground">
                          {d.kindOf === "str"
                            ? `${Intl.NumberFormat().format(d.size)} characters`
                            : `${Intl.NumberFormat().format(d.size)} entries`}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {d.reason}
                    </p>
                    <pre className="mt-2 max-h-56 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed text-foreground">
                      {typeof d.preview === "string"
                        ? d.preview
                        : JSON.stringify(d.preview, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
