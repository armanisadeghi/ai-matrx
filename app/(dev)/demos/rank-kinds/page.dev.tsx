"use client";

/**
 * Rank Kinds Run — Stage B live demo (data-to-kinds queue row 2).
 *
 * ZERO mocks, zero pasted fixtures. It calls the REAL aidream endpoint
 * (`POST /api/rank-kinds/landscape`), which reads a live `seo.serp_snapshot`
 * and the raw provider payload we already paid for, runs it through the
 * translation adapter, and streams back FOUR things: the kind, our persisted
 * projection of that identical payload, the translation report (including
 * every dropped value), and the provider receipt. The kind renders through
 * `KindInstanceRender` — the production route path — not through a component
 * this page imports.
 *
 * THREE TABS, AND THE THIRD IS NON-NEGOTIABLE:
 *
 *  1. LANDSCAPE — the page as kinds, in order, with the tracked target marked.
 *  2. WHAT WE PERSIST TODAY — the same payload as our live pipeline stores it.
 *     This tab IS the finding: the pipeline writes `organic` and `local_pack`
 *     rows and nothing else, while the page contained an AI overview, a
 *     knowledge panel, People-Also-Ask and a Things-to-Know panel. The counts
 *     sit side by side so the gap cannot be missed.
 *  3. WHAT WE HIDE — THE SHOW-WHAT-YOU-HIDE LAW (Arman, 2026-08-23):
 *     *"on anything at all that you choose to remove or ignore… you have to
 *     render them for me in a separate tab so that I can see exactly what we
 *     are hiding from the user."* Every dropped value with its path, reason,
 *     honest size and preview. Unknown keys are a RED banner: the adapter
 *     claimed neither, and a provider that added a field must be noticed.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Database,
  EyeOff,
  Layers,
  Play,
  ShieldCheck,
} from "lucide-react";
import { useBackendApi } from "@/hooks/useBackendApi";
import { consumeStream } from "@/lib/api/stream-parser";
import KindInstanceRender from "@/features/content-ir/studio/components/KindInstanceRender";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
interface Persisted {
  snapshotId: string;
  observedAt: string | null;
  provider: string;
  engine: string;
  searchType: string;
  resultCount: number;
  resultTypes: Record<string, number>;
  observationCount: number;
  rows: Record<string, unknown>[];
}
interface Outcome {
  result: Record<string, unknown>;
  persisted: Persisted | null;
  translation: Report | null;
  receipt: Record<string, unknown> | null;
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

function readPersisted(v: unknown): Persisted | null {
  if (!isRecord(v) || typeof v.snapshot_id !== "string") return null;
  const types: Record<string, number> = {};
  if (isRecord(v.result_types)) {
    for (const [key, count] of Object.entries(v.result_types)) {
      const n = int(count);
      if (n !== null) types[key] = n;
    }
  }
  return {
    snapshotId: v.snapshot_id,
    observedAt: str(v.observed_at),
    provider: str(v.provider) ?? "?",
    engine: str(v.engine) ?? "?",
    searchType: str(v.search_type) ?? "?",
    resultCount: int(v.result_count) ?? 0,
    resultTypes: types,
    observationCount: int(v.observation_count) ?? 0,
    rows: Array.isArray(v.rows) ? v.rows.filter(isRecord) : [],
  };
}

/** What the KIND carries, by block type — the other half of the comparison. */
function kindResultTypes(result: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  const results = Array.isArray(result.results) ? result.results : [];
  for (const item of results) {
    if (!isRecord(item)) continue;
    const type = str(item.result_type) ?? "unknown";
    out[type] = (out[type] ?? 0) + 1;
  }
  return out;
}

// ── page ───────────────────────────────────────────────────────────────────

export default function RankKindsDemoPage() {
  const { post } = useBackendApi();
  const [provider, setProvider] = useState<"serpapi" | "brave">("serpapi");
  const [snapshotId, setSnapshotId] = useState("");
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async () => {
    if (phase === "running") return;
    setPhase("running");
    setOutcome(null);
    try {
      const response = await post("/rank-kinds/landscape", {
        provider,
        ...(snapshotId.trim() ? { snapshot_id: snapshotId.trim() } : {}),
      });
      let received: Outcome | null = null;
      await consumeStream(response, {
        onData: (data) => {
          if (
            isRecord(data) &&
            data.type === "rank_kinds_result" &&
            isRecord(data.result)
          ) {
            received = {
              result: data.result,
              persisted: readPersisted(data.persisted),
              translation: readReport(data.translation),
              receipt: isRecord(data.receipt) ? data.receipt : null,
            };
          }
        },
        onError: (e) => {
          throw new Error(
            e.user_message || e.message || "The landscape call failed.",
          );
        },
      });
      if (!received) {
        throw new Error("The stream ended without a rank_kinds_result event.");
      }
      setOutcome(received);
      setPhase("done");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "The landscape call failed.",
      );
      setPhase(outcome ? "done" : "idle");
    }
  };

  const report = outcome?.translation ?? null;
  const persisted = outcome?.persisted ?? null;
  const kindTypes = outcome ? kindResultTypes(outcome.result) : {};
  const kindTotal = Object.values(kindTypes).reduce((a, b) => a + b, 0);
  const everyType = Array.from(
    new Set([...Object.keys(kindTypes), ...Object.keys(persisted?.resultTypes ?? {})]),
  ).sort();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Rank Kinds — live pipeline demo
        </h1>
        <p className="text-sm text-muted-foreground">
          A real tracked SERP from <code className="text-xs">seo.serp_snapshot</code>{" "}
          and the raw provider payload we already paid for, translated into the
          rank kind family and rendered entirely through the registered kind
          components. Every nested result renders through the SEARCH family&apos;s
          components — this family re-draws none of them. No mocks.
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Select
          value={provider}
          onValueChange={(v) => setProvider(v as "serpapi" | "brave")}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="serpapi">Google (SerpAPI) — latest snapshot</SelectItem>
            <SelectItem value="brave">Brave — latest snapshot</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={snapshotId}
          onChange={(e) => setSnapshotId(e.target.value)}
          placeholder="Optional: a specific seo.serp_snapshot id"
          className="min-w-64 flex-1"
        />
        <Button type="submit" disabled={phase === "running"}>
          <Play className="mr-1.5 h-4 w-4" />
          Translate
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        Deliberately reads a STORED payload rather than firing a fresh paid
        call: the finding this run makes is that we discard most of a page we
        already bought, and you can only show that with the exact payload beside
        the exact rows it produced. A demo route that spends money is a spend
        surface.
      </p>

      {phase === "running" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Reading the snapshot and its raw payload → translation adapter → kind…
        </div>
      )}

      {outcome && (
        <Tabs defaultValue="landscape" className="w-full">
          <TabsList>
            <TabsTrigger value="landscape">
              <Layers className="mr-1.5 h-4 w-4" />
              Landscape
            </TabsTrigger>
            <TabsTrigger value="persisted">
              <Database className="mr-1.5 h-4 w-4" />
              What we persist today
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

          {/* ── 1. The page as kinds ─────────────────────────────────────── */}
          <TabsContent value="landscape" className="space-y-3">
            {outcome.receipt && (
              <KindInstanceRender
                kind="provider_run_receipt"
                value={outcome.receipt}
              />
            )}
            <KindInstanceRender
              kind="seo_rank_serp_landscape"
              value={outcome.result}
              showRoutingNote
            />
          </TabsContent>

          {/* ── 2. The finding ───────────────────────────────────────────── */}
          <TabsContent value="persisted" className="space-y-3">
            {!persisted ? (
              <p className="text-sm text-muted-foreground">
                The server returned no persisted projection for this snapshot.
              </p>
            ) : (
              <>
                <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <AlertTriangle className="h-4 w-4 text-warning" />
                    The live pipeline stored {persisted.resultCount} of{" "}
                    {kindTotal} positions on this page.
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Same payload, both columns. Everything the right column
                    counts and the left column does not is data we paid the
                    provider for and threw away — and every one of those block
                    types already has a shipped, verified kind and component.
                  </p>
                </div>

                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Block type</th>
                        <th className="px-3 py-2 text-right">
                          Persisted today (seo.serp_result)
                        </th>
                        <th className="px-3 py-2 text-right">
                          Carried by the kind
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {everyType.map((type) => {
                        const stored = persisted.resultTypes[type] ?? 0;
                        const inKind = kindTypes[type] ?? 0;
                        const lost = inKind - stored;
                        return (
                          <tr
                            key={type}
                            className={
                              lost > 0
                                ? "border-t border-border bg-destructive/5"
                                : "border-t border-border"
                            }
                          >
                            <td className="px-3 py-1.5 font-medium text-foreground">
                              {type}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">
                              {stored === 0 ? (
                                <span className="text-destructive">0</span>
                              ) : (
                                stored
                              )}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                              {inKind}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t border-border bg-muted/30 font-medium">
                        <td className="px-3 py-1.5">Total</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {persisted.resultCount}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {kindTotal}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="text-xs text-muted-foreground">
                  snapshot <code>{persisted.snapshotId}</code> ·{" "}
                  {persisted.provider} / {persisted.engine} /{" "}
                  {persisted.searchType} · {persisted.observationCount} rank
                  observation(s)
                  {persisted.observedAt ? ` · observed ${persisted.observedAt}` : ""}
                </div>

                <details className="rounded-md border border-border">
                  <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
                    The {persisted.rows.length} rows exactly as they sit in{" "}
                    <code>seo.serp_result</code>
                  </summary>
                  <pre className="max-h-96 overflow-auto px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">
                    {JSON.stringify(persisted.rows, null, 2)}
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
                  UNKNOWN PROVIDER KEYS — the adapter claims neither MAPPED nor
                  DROPPED
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {report.provider} sent data nobody decided about. Add each key
                  to a register in the adapter, with a reason.
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
                Fully accounted — every raw {report.provider} key is MAPPED or
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
