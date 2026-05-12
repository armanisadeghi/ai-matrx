/**
 * Right-rail Search panel — POST /files/{id}/search → list of hits.
 */

"use client";

import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import * as Api from "@/features/file-analysis/api/file-analysis";
import type {
  SearchHitOut,
} from "@/features/file-analysis/api/file-analysis";

interface Props {
  fileId: string;
  onJumpToPage: (pageNumber: number, pageId?: string | null) => void;
}

export function SearchPanel({ fileId, onJumpToPage }: Props) {
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchHitOut[]>([]);
  const [truncated, setTruncated] = useState(false);

  async function run() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await Api.searchInFile(fileId, {
        query,
        regex,
        case_sensitive: caseSensitive,
        max_hits: 200,
        include_excluded_pages: false,
      });
      setHits(data.hits);
      setTruncated(data.truncated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col text-xs">
      <div className="space-y-1.5 border-b border-border p-2">
        <div className="flex items-center gap-1.5">
          <Input
            placeholder="Search in document…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            disabled={loading || !query.trim()}
            onClick={() => void run()}
            className="h-7 text-[10px]"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-[10px]">
            <Checkbox
              checked={regex}
              onCheckedChange={(v) => setRegex(v === true)}
            />
            regex
          </label>
          <label className="flex items-center gap-1 text-[10px]">
            <Checkbox
              checked={caseSensitive}
              onCheckedChange={(v) => setCaseSensitive(v === true)}
            />
            case sensitive
          </label>
        </div>
        {error ? <div className="text-[10px] text-destructive">{error}</div> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {hits.length === 0 && !loading ? (
          <div className="px-3 py-6 text-center text-muted-foreground">
            {query ? "No matches." : "Type a query above to search."}
          </div>
        ) : (
          <ul className="space-y-1">
            {hits.map((h, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  onClick={() => onJumpToPage(h.page_number, h.page_id)}
                  className={cn(
                    "block w-full rounded px-2 py-1 text-left hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded bg-muted px-1 py-px text-[9px] uppercase">
                      p{h.page_number}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {Math.round(h.bbox.x0)},{Math.round(h.bbox.y0)}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                    {h.snippet}
                  </div>
                </button>
              </li>
            ))}
            {truncated ? (
              <li className="px-2 py-1 text-[10px] italic text-muted-foreground">
                More than 200 matches — refine your query.
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}
