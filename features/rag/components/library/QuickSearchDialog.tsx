"use client";

/**
 * QuickSearchDialog — direct search of one document, no preview-tab
 * navigation required. Opens from a library row's Search button.
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search as SearchIcon, ExternalLink } from "lucide-react";
import { postJson } from "@/lib/python-client";
import { RAG_VOCAB } from "@/features/rag/constants/vocabulary";

interface ApiHit {
  chunk_id: string;
  chunk_index: number | null;
  score: number;
  page_numbers: number[] | null;
  section_kind: string | null;
  content_text: string;
}

interface ApiResponse {
  document_id: string;
  query: string;
  hits: ApiHit[];
  total_chunks_in_doc: number;
}

export interface QuickSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processedDocumentId: string | null;
  documentName: string | null;
}

export function QuickSearchDialog({
  open,
  onOpenChange,
  processedDocumentId,
  documentName,
}: QuickSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ApiHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open / doc change
  useEffect(() => {
    if (open) {
      setQuery("");
      setHits(null);
      setError(null);
      // Autofocus
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, processedDocumentId]);

  const run = async () => {
    if (!processedDocumentId || !query.trim()) return;
    setLoading(true);
    setError(null);
    setHits(null);
    try {
      const { data } = await postJson<
        ApiResponse,
        { query: string; limit: number }
      >(`/rag/library/${processedDocumentId}/test-search`, {
        query: query.trim(),
        limit: 15,
      });
      setHits(Array.isArray(data?.hits) ? data.hits : []);
      setTotal(
        typeof data?.total_chunks_in_doc === "number"
          ? data.total_chunks_in_doc
          : 0,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80dvh] flex flex-col p-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <SearchIcon className="h-4 w-4" />
            Search inside{" "}
            <span className="break-words">{documentName ?? "document"}</span>
          </DialogTitle>
          <DialogDescription>
            Lexical search over this document's{" "}
            {RAG_VOCAB.segmentsShort.toLowerCase()}
            {total > 0
              ? ` (${total} ${RAG_VOCAB.segmentsShort.toLowerCase()})`
              : ""}
            . Same scoring an agent would use when retrieving from this doc.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 border-b flex gap-2">
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a query and hit Enter…"
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
          <Button onClick={run} disabled={!query.trim() || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-2">
            {error && (
              <div className="border border-destructive/50 bg-destructive/5 rounded-md p-3 text-sm text-destructive">
                <strong>Error:</strong> {error}
              </div>
            )}
            {!loading && hits === null && !error && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Type a query above and hit Search to keyword-search this
                document's text. This is a literal keyword (lexical) match — not
                the semantic AI retrieval an agent performs; use AI search for
                that.
              </p>
            )}
            {hits && hits.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8 italic">
                No matches. Try simpler keywords.
              </p>
            )}
            {hits?.map((h, i) => (
              <div
                key={h.chunk_id}
                className="border rounded-md p-3 space-y-2 bg-card"
              >
                <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    #{i + 1}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    score {h.score.toFixed(3)}
                  </Badge>
                  {h.page_numbers && h.page_numbers.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      p.{h.page_numbers[0]}
                      {h.page_numbers.length > 1
                        ? `–${h.page_numbers[h.page_numbers.length - 1]}`
                        : ""}
                    </Badge>
                  )}
                  {h.section_kind && (
                    <Badge variant="info" className="text-[10px]">
                      {h.section_kind}
                    </Badge>
                  )}
                  {processedDocumentId &&
                    h.page_numbers &&
                    h.page_numbers.length > 0 && (
                      <a
                        href={`/rag/library/${processedDocumentId}/preview?page=${h.page_numbers[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-primary text-[11px] hover:underline"
                      >
                        Open in preview <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                </div>
                <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed font-sans max-h-40 overflow-auto">
                  {h.content_text}
                </pre>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
