"use client";

/**
 * Search Kinds Pilot — Stage B live demo (data-to-kinds run 1).
 *
 * Proves the whole pipe with ZERO mocks: a real provider search runs on
 * aidream (`POST /api/search-kinds/search` — engine → translation adapter →
 * `web_search_results` kind JSON streamed back), and the result renders
 * entirely through the registered kind components (`KindInstanceRender` →
 * the production route path → `WebSearchResultsBlock` → nested kind
 * delegation).
 *
 * Brave is the default provider. Google runs on SerpAPI credits (250/month
 * free plan) that rank tracking also spends, so since 2026-08-23 the server's
 * `search.public_providers` knob allows Brave ONLY and a Google request here
 * returns a 400 — testing the Google translation means an admin widening that
 * knob to `brave,google` for the duration.
 */

import { useState } from "react";
import { Search, ShieldAlert, ShieldCheck } from "lucide-react";
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
import { toast } from "@/lib/toast";

interface UnknownKeys {
  section: string;
  keys: string[];
}

interface TranslationReport {
  provider: string;
  unknown: UnknownKeys[];
}

interface SearchKindsResult {
  result: Record<string, unknown>;
  translation: TranslationReport | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function readTranslation(v: unknown): TranslationReport | null {
  if (!isRecord(v) || typeof v.provider !== "string") return null;
  const unknown: UnknownKeys[] = Array.isArray(v.unknown)
    ? v.unknown.flatMap((u) =>
        isRecord(u) && typeof u.section === "string" && Array.isArray(u.keys)
          ? [{ section: u.section, keys: u.keys.map(String) }]
          : [],
      )
    : [];
  return { provider: v.provider, unknown };
}

export default function SearchKindsDemoPage() {
  const { post } = useBackendApi();
  const [provider, setProvider] = useState<"brave" | "google">("brave");
  const [query, setQuery] = useState("best pizza in chicago");
  const [count, setCount] = useState(10);
  const [phase, setPhase] = useState<"idle" | "searching" | "done">("idle");
  const [outcome, setOutcome] = useState<SearchKindsResult | null>(null);

  const run = async () => {
    const trimmed = query.trim();
    if (!trimmed || phase === "searching") return;
    setPhase("searching");
    setOutcome(null);
    try {
      const response = await post("/search-kinds/search", {
        provider,
        query: trimmed,
        count,
      });
      let received: SearchKindsResult | null = null;
      await consumeStream(response, {
        onData: (data) => {
          if (
            isRecord(data) &&
            data.type === "search_kinds_result" &&
            isRecord(data.result)
          ) {
            received = {
              result: data.result,
              translation: readTranslation(data.translation),
            };
          }
        },
        onError: (e) => {
          throw new Error(e.user_message || e.message || "Search failed.");
        },
      });
      if (!received) {
        throw new Error("The stream ended without a search_kinds_result event.");
      }
      setOutcome(received);
      setPhase("done");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed.");
      setPhase(outcome ? "done" : "idle");
    }
  };

  const unknown = outcome?.translation?.unknown ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          Search Kinds — live pipeline demo
        </h1>
        <p className="text-sm text-muted-foreground">
          A real provider search on aidream, translated into the merged{" "}
          <code className="text-xs">web_search_results</code> kind family and
          rendered entirely through the registered kind components. No mocks.
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
          placeholder="Search the web…"
          className="min-w-56 flex-1"
        />
        <Select
          value={provider}
          onValueChange={(v) => setProvider(v as "brave" | "google")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="brave">Brave</SelectItem>
            <SelectItem value="google">Google (SerpAPI · paid credits)</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(count)}
          onValueChange={(v) => setCount(Number(v))}
        >
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[5, 10, 20].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={phase === "searching" || !query.trim()}>
          <Search className="mr-1.5 h-4 w-4" />
          Search
        </Button>
      </form>

      {provider === "google" && (
        <p className="text-xs text-warning">
          Google is refused by the server unless an admin widens the{" "}
          <code className="text-[11px]">search.public_providers</code> knob to{" "}
          <code className="text-[11px]">brave,google</code> — it spends the same
          SerpAPI credits (250/month) rank tracking runs on.
        </p>
      )}

      {phase === "searching" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Searching {provider === "brave" ? "Brave" : "Google"} for “{query.trim()}”
          — engine → translation adapter → kind…
        </div>
      )}

      {outcome && (
        <>
          {/* The translation-audit verdict: every raw key MAPPED or DROPPED. */}
          {unknown.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" />
              Translation fully accounted — every raw {outcome.translation?.provider}{" "}
              key is MAPPED or DROPPED in the adapter's registers.
            </div>
          ) : (
            <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <ShieldAlert className="h-4 w-4 text-warning" />
                Unknown provider keys (the adapter must claim these):
              </div>
              <ul className="mt-1 list-disc pl-6 text-muted-foreground">
                {unknown.map((u, i) => (
                  <li key={i}>
                    <span className="font-medium">{u.section}</span>:{" "}
                    {u.keys.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The kind, through the REAL production render path. */}
          <KindInstanceRender
            kind="web_search_results"
            value={outcome.result}
            showRoutingNote
          />
        </>
      )}
    </div>
  );
}
