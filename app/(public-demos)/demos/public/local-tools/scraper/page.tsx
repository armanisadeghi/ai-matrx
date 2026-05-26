"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  Loader2,
  Search,
  XCircle,
  Zap,
} from "lucide-react";
import { ConnectionBar } from "../_lib/ConnectionBar";
import { MessageLog } from "../_lib/ResultPanel";
import { useMatrxLocalContext } from "../_lib/MatrxLocalContext";
import type { UseMatrxLocalReturn } from "../_lib/useMatrxLocal";
import type {
  BatchScrapeMetadata,
  ResearchMetadata,
  ScrapeResultMeta,
  SearchMetadata,
  SearchResult,
} from "../_lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string) {
  if (status === "success") return "text-green-600 border-green-500";
  if (status === "error") return "text-red-600 border-red-500";
  return "text-yellow-600 border-yellow-500";
}

// ---------------------------------------------------------------------------
// Scrape Panel
// ---------------------------------------------------------------------------

function ScrapePanel({ local }: { local: UseMatrxLocalReturn }) {
  const { invokeTool, loading } = local;
  const [urls, setUrls] = useState("https://titaniumsuccess.com/");
  const [useCache, setUseCache] = useState(true);
  const [getLinks, setGetLinks] = useState(false);
  const [getOverview, setGetOverview] = useState(false);
  const [outputMode, setOutputMode] = useState<"rich" | "research">("rich");
  const [results, setResults] = useState<{
    output: string;
    meta: BatchScrapeMetadata | ScrapeResultMeta | null;
  } | null>(null);
  const [expandedContent, setExpandedContent] = useState(false);
  const isDisabled = !!loading;

  const runScrape = async () => {
    const urlList = urls
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) => (u.match(/^https?:\/\//i) ? u : `https://${u}`));
    setResults(null);
    const result = await invokeTool("Scrape", {
      urls: urlList,
      use_cache: useCache,
      get_links: getLinks,
      get_overview: getOverview,
      output_mode: outputMode,
    });

    const meta =
      (result.metadata as unknown as
        | BatchScrapeMetadata
        | ScrapeResultMeta
        | null) ?? null;
    setResults({ output: result.output, meta });
  };

  const batchMeta =
    results?.meta && "results" in results.meta
      ? (results.meta as BatchScrapeMetadata)
      : null;
  const singleMeta =
    results?.meta && !("results" in (results.meta ?? {}))
      ? (results.meta as ScrapeResultMeta)
      : null;

  return (
    <div className="space-y-3">
      {/* URL Input */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">
          URLs (one per line, max 100)
        </label>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          rows={4}
          className="w-full text-xs font-mono rounded border px-3 py-2 bg-background resize-none"
          placeholder="https://example.com&#10;https://news.ycombinator.com"
          style={{ fontSize: "16px" }}
        />
      </div>

      {/* Options */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-4">
          {[
            { label: "Use Cache", state: useCache, set: setUseCache },
            { label: "Get Links", state: getLinks, set: setGetLinks },
            { label: "Get Overview", state: getOverview, set: setGetOverview },
          ].map(({ label, state, set }) => (
            <label
              key={label}
              className="flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <Checkbox
                checked={state}
                onCheckedChange={(v) => set(v === true)}
                className="shrink-0"
              />
              {label}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Mode:</span>
          {(["rich", "research"] as const).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={outputMode === m ? "default" : "outline"}
              className="h-6 text-[10px] px-2"
              onClick={() => setOutputMode(m)}
            >
              {m}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          disabled={isDisabled}
          onClick={runScrape}
          className="ml-auto gap-1.5"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Globe className="w-3.5 h-3.5" />
          )}
          Scrape
        </Button>
      </div>

      {/* Results */}
      {results && (
        <div className="space-y-2">
          {/* Batch summary */}
          {batchMeta && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge
                variant="outline"
                className="text-green-600 border-green-500"
              >
                {batchMeta.success_count}/{batchMeta.total} success
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {batchMeta.elapsed_ms}ms
              </Badge>
            </div>
          )}
          {/* Per-URL result cards (batch) */}
          {batchMeta?.results.map((r, i) => (
            <div key={i} className="border rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1 ${statusColor(r.status)}`}
                >
                  {r.status}
                </Badge>
                {r.from_cache && (
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1 text-blue-500 border-blue-400"
                  >
                    cached
                  </Badge>
                )}
                {r.content_type && (
                  <span className="text-[10px] text-muted-foreground">
                    {r.content_type}
                  </span>
                )}
                {r.cms && r.cms !== "unknown" && (
                  <span className="text-[10px] text-muted-foreground">
                    CMS: {r.cms}
                  </span>
                )}
                {r.firewall && r.firewall !== "none" && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1">
                    {r.firewall}
                  </Badge>
                )}
                {r.elapsed_ms && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {r.elapsed_ms}ms
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                {r.url}
              </p>
              {r.error && <p className="text-[11px] text-red-500">{r.error}</p>}
            </div>
          ))}
          {/* Single URL card */}
          {singleMeta && (
            <div className="border rounded-lg p-2 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1 ${statusColor(singleMeta.status)}`}
                >
                  {singleMeta.status}
                </Badge>
                {singleMeta.from_cache && (
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1 text-blue-500 border-blue-400"
                  >
                    cached
                  </Badge>
                )}
                {singleMeta.content_type && (
                  <span className="text-[10px] text-muted-foreground">
                    {singleMeta.content_type}
                  </span>
                )}
                {singleMeta.cms && singleMeta.cms !== "unknown" && (
                  <span className="text-[10px] text-muted-foreground">
                    CMS: {singleMeta.cms}
                  </span>
                )}
                {singleMeta.firewall && singleMeta.firewall !== "none" && (
                  <Badge variant="destructive" className="text-[10px] h-4 px-1">
                    {singleMeta.firewall}
                  </Badge>
                )}
                {singleMeta.elapsed_ms && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {singleMeta.elapsed_ms}ms
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Output text */}
          <div className="border rounded-lg overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium bg-muted/50 hover:bg-muted/70 transition-colors"
              onClick={() => setExpandedContent((p) => !p)}
            >
              <span>Extracted Content</span>
              {expandedContent ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
            {expandedContent && (
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all p-3 bg-muted/20 max-h-80 overflow-y-auto">
                {results.output}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Search Panel
// ---------------------------------------------------------------------------

function SearchPanel({ local }: { local: UseMatrxLocalReturn }) {
  const { invokeTool, loading } = local;
  const [keywords, setKeywords] = useState("latest AI frameworks 2026");
  const [country, setCountry] = useState("us");
  const [count, setCount] = useState(10);
  const [freshness, setFreshness] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [meta, setMeta] = useState<SearchMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDisabled = !!loading;

  const runSearch = async () => {
    setResults([]);
    setMeta(null);
    setError(null);
    const kwList = keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const result = await invokeTool("Search", {
      keywords: kwList,
      country,
      count,
      freshness: freshness || null,
    });
    if (result.type === "error") {
      setError(result.output);
    } else {
      const m = result.metadata as unknown as SearchMetadata | undefined;
      if (m?.results) {
        setResults(m.results);
        setMeta(m);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Keywords (comma-separated)
          </label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            className="w-full h-8 text-xs rounded border px-2 bg-background"
            style={{ fontSize: "16px" }}
          />
        </div>
        <div className="flex gap-2">
          <div className="space-y-1 flex-1">
            <label className="text-xs font-medium text-muted-foreground">
              Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full h-8 text-xs rounded border px-2 bg-background"
            >
              {["us", "gb", "ca", "au", "de", "fr", "jp"].map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1 w-24">
            <label className="text-xs font-medium text-muted-foreground">
              Count ({count})
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full mt-2"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Freshness
          </label>
          <select
            value={freshness}
            onChange={(e) => setFreshness(e.target.value)}
            className="w-full h-8 text-xs rounded border px-2 bg-background"
          >
            <option value="">Any time</option>
            <option value="pd">Past day</option>
            <option value="pw">Past week</option>
            <option value="pm">Past month</option>
            <option value="py">Past year</option>
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={isDisabled}
          onClick={runSearch}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Search className="w-3.5 h-3.5" />
          )}
          Search
        </Button>
      </div>

      {error && (
        <div className="border border-destructive/50 rounded-lg p-3 bg-destructive/10 text-sm text-destructive">
          {error}
        </div>
      )}

      {meta && (
        <div className="flex gap-2 text-xs">
          <Badge variant="outline">{meta.total} results</Badge>
          <Badge variant="outline" className="text-muted-foreground">
            {meta.elapsed_ms}ms
          </Badge>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {results.map((r, i) => (
            <div key={i} className="border rounded-lg p-3 space-y-1 bg-card">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline line-clamp-2"
                >
                  {r.title}
                </a>
                {r.age && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {r.age}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-mono text-muted-foreground truncate">
                {r.url}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {r.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Research Panel
// ---------------------------------------------------------------------------

function ResearchPanel({ local }: { local: UseMatrxLocalReturn }) {
  const { invokeTool, loading, wsConnected, cancelAll } = local;
  const [query, setQuery] = useState("");
  const [effort, setEffort] = useState<"low" | "medium" | "high" | "extreme">(
    "low",
  );
  const [country, setCountry] = useState("us");
  const [freshness, setFreshness] = useState("");
  const [result, setResult] = useState<{
    output: string;
    meta: ResearchMetadata | null;
  } | null>(null);
  const isDisabled = !!loading;

  const effortMap = { low: 10, medium: 25, high: 50, extreme: 100 } as const;

  const runResearch = async () => {
    if (!query.trim()) return;
    setResult(null);
    const res = await invokeTool(
      "Research",
      {
        query: query.trim(),
        country,
        effort,
        freshness: freshness || null,
      },
      120_000,
    );
    const meta = res.metadata as unknown as ResearchMetadata | undefined;
    setResult({ output: res.output, meta: meta ?? null });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">
          Research Query
        </label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full h-9 text-sm rounded border px-3 bg-background"
          placeholder="e.g. how does transformer attention mechanism work"
          style={{ fontSize: "16px" }}
          onKeyDown={(e) => e.key === "Enter" && runResearch()}
        />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        {/* Effort */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Effort level</label>
          <div className="flex gap-1">
            {(Object.keys(effortMap) as (keyof typeof effortMap)[]).map((e) => (
              <Button
                key={e}
                size="sm"
                variant={effort === e ? "default" : "outline"}
                className="h-7 text-xs px-2"
                onClick={() => setEffort(e)}
              >
                {e} ({effortMap[e]})
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Country</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-7 text-xs rounded border px-2 bg-background"
          >
            {["us", "gb", "ca", "au", "de", "fr"].map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Freshness</label>
          <select
            value={freshness}
            onChange={(e) => setFreshness(e.target.value)}
            className="h-7 text-xs rounded border px-2 bg-background"
          >
            <option value="">Any</option>
            <option value="pd">Past day</option>
            <option value="pw">Past week</option>
            <option value="pm">Past month</option>
          </select>
        </div>

        <div className="flex gap-2 ml-auto mt-4">
          {loading && wsConnected && (
            <Button
              size="sm"
              variant="destructive"
              onClick={cancelAll}
              className="gap-1 h-8"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={isDisabled || !query.trim()}
            onClick={runResearch}
            className="gap-1.5 h-8"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            Research
          </Button>
        </div>
      </div>

      {loading && (
        <div className="border rounded-lg p-4 bg-muted/20 text-center space-y-2">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Researching… this can take 10–60 seconds ({effort} effort = up to{" "}
            {effortMap[effort]} pages)
          </p>
          {wsConnected && (
            <p className="text-xs text-muted-foreground">
              Cancel anytime with the button above
            </p>
          )}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {result.meta && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge
                variant="outline"
                className="text-green-600 border-green-500"
              >
                {result.meta.pages_scraped} pages scraped
              </Badge>
              {result.meta.pages_failed > 0 && (
                <Badge
                  variant="outline"
                  className="text-orange-500 border-orange-400"
                >
                  {result.meta.pages_failed} failed
                </Badge>
              )}
              <Badge variant="outline" className="text-muted-foreground">
                {(result.meta.elapsed_ms / 1000).toFixed(1)}s
              </Badge>
              <Badge variant="outline" className="text-muted-foreground">
                {Math.round(result.meta.content_length / 1000)}KB content
              </Badge>
            </div>
          )}
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all p-3 bg-muted/20 rounded-lg border max-h-[500px] overflow-y-auto">
            {result.output}
          </pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison Panel
// ---------------------------------------------------------------------------

interface CompareResult {
  content: string;
  elapsedMs: number;
}

type ContentGrade = "failure" | "thin" | "success";

function gradeContent(content: string): ContentGrade {
  const len = content.trim().length;
  if (len < 200) return "failure";
  if (len <= 1000) return "thin";
  return "success";
}

const GRADE_CONFIG: Record<
  ContentGrade,
  { label: string; classes: string; barColor: string }
> = {
  failure: {
    label: "Failure",
    classes: "text-red-600 border-red-500 bg-red-500/10",
    barColor: "bg-red-500",
  },
  thin: {
    label: "Thin Content",
    classes: "text-yellow-600 border-yellow-500 bg-yellow-500/10",
    barColor: "bg-yellow-500",
  },
  success: {
    label: "Success",
    classes: "text-green-600 border-green-500 bg-green-500/10",
    barColor: "bg-green-500",
  },
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function ResultCard({
  label,
  result,
  isLoading,
}: {
  label: string;
  result: CompareResult | null;
  isLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const PREVIEW_CHARS = 2000;

  const grade = result ? gradeContent(result.content) : null;
  const gradeConfig = grade ? GRADE_CONFIG[grade] : null;
  const isLong = result && result.content.length > PREVIEW_CHARS;

  const handleCopy = async () => {
    if (!result?.content) return;
    await navigator.clipboard.writeText(result.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 bg-muted/50 border-b flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        {gradeConfig && (
          <Badge
            variant="outline"
            className={`text-[10px] h-5 px-1.5 shrink-0 ${gradeConfig.classes}`}
          >
            {gradeConfig.label}
          </Badge>
        )}
      </div>

      {/* Metrics bar */}
      {result && (
        <div className="flex items-center gap-x-3 px-3 py-1.5 bg-muted/20 border-b text-[11px]">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">
              {result.content.trim().length.toLocaleString()}
            </span>{" "}
            chars
          </span>
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">
              {countWords(result.content).toLocaleString()}
            </span>{" "}
            words
          </span>
          <span className="text-muted-foreground ml-auto">
            <span className="font-semibold text-foreground">
              {result.elapsedMs.toLocaleString()}
            </span>
            ms
          </span>
          <button
            onClick={handleCopy}
            title="Copy to clipboard"
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <>
                <span className="text-green-600">✓</span>
                <span className="text-green-600 text-[10px]">Copied</span>
              </>
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1">
        {isLoading && !result && (
          <div className="flex items-center justify-center h-20">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!isLoading && !result && (
          <p className="text-xs text-muted-foreground text-center py-6">
            No result
          </p>
        )}
        {result && (
          <div>
            <div className="max-h-72 overflow-y-auto p-2">
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">
                {expanded
                  ? result.content
                  : result.content.slice(0, PREVIEW_CHARS)}
                {!expanded && isLong && (
                  <span className="text-muted-foreground"> …</span>
                )}
              </pre>
            </div>
            {isLong && (
              <button
                onClick={() => setExpanded((p) => !p)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-primary hover:bg-muted/40 border-t transition-colors"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Collapse
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Show all (
                    {(result.content.length - PREVIEW_CHARS).toLocaleString()}{" "}
                    more chars)
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ComparisonPanel({ local }: { local: UseMatrxLocalReturn }) {
  const { invokeViaRest, loading } = local;
  const [url, setUrl] = useState("https://titaniumsuccess.com/");
  const [results, setResults] = useState<
    [CompareResult | null, CompareResult | null, CompareResult | null]
  >([null, null, null]);
  const [comparing, setComparing] = useState(false);

  const runComparison = async () => {
    if (!url.trim()) return;
    const normalizedUrl = url.trim().match(/^https?:\/\//i)
      ? url.trim()
      : `https://${url.trim()}`;
    setComparing(true);
    setResults([null, null, null]);

    // Server scrape: Next.js API route → Python backend (runs from data center)
    const serverScrape = async (): Promise<CompareResult> => {
      const t = Date.now();
      const res = await fetch("/api/scraper/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl }),
      });
      const elapsed = Date.now() - t;
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return {
          content: `Error: ${err.error || res.statusText}`,
          elapsedMs: elapsed,
        };
      }
      const data = await res.json();
      const content =
        data.textContent || data.overview?.page_title || JSON.stringify(data);
      return { content, elapsedMs: elapsed };
    };

    const [server_, localScrape_, localBrowser_] = await Promise.allSettled([
      serverScrape(),
      (async () => {
        const t = Date.now();
        const r = await invokeViaRest("Scrape", {
          urls: [normalizedUrl],
          use_cache: false,
          output_mode: "rich",
        });
        return { content: r.output, elapsedMs: Date.now() - t };
      })(),
      (async () => {
        const t = Date.now();
        const r = await invokeViaRest("FetchWithBrowser", {
          url: normalizedUrl,
          extract_text: true,
        });
        return { content: r.output, elapsedMs: Date.now() - t };
      })(),
    ]);

    const toResult = (r: PromiseSettledResult<CompareResult>): CompareResult =>
      r.status === "fulfilled"
        ? r.value
        : {
            content: `Error: ${(r as PromiseRejectedResult).reason}`,
            elapsedMs: 0,
          };

    setResults([
      toResult(server_),
      toResult(localScrape_),
      toResult(localBrowser_),
    ]);
    setComparing(false);
  };

  const labels = [
    "Data Center Server Scrape",
    "Local PC Scrape",
    "Local PC Browser Scrape",
  ];
  const anyResult = results.some((r) => r !== null);

  return (
    <div className="space-y-4">
      {/* URL input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 h-8 text-xs font-mono rounded border px-2 bg-background"
          placeholder="https://example.com"
          style={{ fontSize: "16px" }}
          onKeyDown={(e) => e.key === "Enter" && runComparison()}
        />
        <Button
          size="sm"
          disabled={comparing || !!loading}
          onClick={runComparison}
          className="gap-1.5"
        >
          {comparing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Globe className="w-3.5 h-3.5" />
          )}
          Compare
        </Button>
      </div>

      {/* Summary bar */}
      {anyResult && (
        <div className="rounded-lg border overflow-hidden">
          <div className="divide-y">
            {labels.map((label, i) => {
              const r = results[i];
              const grade = r ? gradeContent(r.content) : null;
              const gradeConfig = grade ? GRADE_CONFIG[grade] : null;
              const maxChars = Math.max(
                ...results.map((x) => x?.content.trim().length ?? 0),
                1,
              );
              const pct = r
                ? Math.round((r.content.trim().length / maxChars) * 100)
                : 0;
              return (
                <div
                  key={label}
                  className="flex items-center gap-3 px-3 py-2 text-xs"
                >
                  <span className="w-48 font-medium shrink-0 text-[11px]">
                    {label}
                  </span>
                  {r ? (
                    <>
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${gradeConfig?.barColor ?? "bg-primary"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-24 text-right shrink-0">
                        {r.content.trim().length.toLocaleString()} chars
                      </span>
                      <span className="text-muted-foreground w-16 text-right shrink-0">
                        {r.elapsedMs.toLocaleString()}ms
                      </span>
                      {gradeConfig && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] h-4 px-1.5 w-24 justify-center shrink-0 ${gradeConfig.classes}`}
                        >
                          {gradeConfig.label}
                        </Badge>
                      )}
                    </>
                  ) : comparing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Result cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {labels.map((label, i) => (
          <ResultCard
            key={label}
            label={label}
            result={results[i]}
            isLoading={comparing}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type ActiveTab = "scrape" | "search" | "research" | "compare";

const TABS: { id: ActiveTab; label: string }[] = [
  { id: "scrape", label: "Scrape" },
  { id: "search", label: "Search" },
  { id: "research", label: "Research" },
  { id: "compare", label: "Comparison" },
];

export default function ScraperPage() {
  const local = useMatrxLocalContext();
  const [activeTab, setActiveTab] = useState<ActiveTab>("scrape");

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-screen-2xl mx-auto space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <Link href="/demos/local-tools">
              <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs">
                <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Scraper Engine
              </h1>
              <p className="text-xs text-muted-foreground">
                Multi-strategy scraping with residential IP, bot-bypass, and
                deep research
              </p>
            </div>
          </div>

          <ConnectionBar hook={local} />

          {/* Tabs (desktop) / Vertical sections (mobile handled via overflow scroll) */}
          <div className="border rounded-lg bg-card overflow-hidden">
            <div className="flex border-b bg-muted/30 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 text-sm font-medium shrink-0 transition-colors border-b-2 ${
                    activeTab === tab.id
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="p-4">
              {activeTab === "scrape" && <ScrapePanel local={local} />}
              {activeTab === "search" && <SearchPanel local={local} />}
              {activeTab === "research" && <ResearchPanel local={local} />}
              {activeTab === "compare" && <ComparisonPanel local={local} />}
            </div>
          </div>

          {/* Message log */}
          <MessageLog logs={local.logs} onClear={local.clearLogs} />
        </div>
      </div>
    </div>
  );
}
