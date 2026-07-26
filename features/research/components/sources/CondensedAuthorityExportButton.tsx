"use client";

import { useState, useCallback, useMemo } from "react";
import {
  FileStack,
  ChevronDown,
  Braces,
  Download,
  Webhook,
  Loader2,
  Check,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { getCurationData } from "../../service";
import {
  buildCondensedAuthorityExport,
  chunkCondensedAuthorityExport,
  condensedAuthorityExportToJson,
  condensedAuthorityExportFilename,
  CONDENSED_EXPORT_SNIPPET_LIMITS,
  type CondensedAuthorityChunk,
} from "../../utils/condensedAuthorityExport";
import {
  AUTHORITY_EXPORT_CHUNK_SIZES,
  authorityExportBatchLabel,
  EXPORT_MENU_RADIO_CLASS,
  fetchTopicSourceCount,
  writeExportClipboard,
} from "../../utils/authorityExportMenu";

interface CondensedAuthorityExportButtonProps {
  topicId: string;
  topicName: string | null;
}

function chunkAiText(chunk: CondensedAuthorityChunk): string {
  const batchNote =
    chunk.chunkCount > 1
      ? ` This is batch ${chunk.chunkIndex} of ${chunk.chunkCount} (${chunk.totalSourceCount} sources total).`
      : "";
  return buildAgentPayload({
    kind: "research-source-authority-ranking-condensed",
    location: "AI Matrx — Research · Sources",
    description: chunk.instructions + batchNote,
    data: { sources: chunk.sources },
    attributes: {
      topicId: chunk.topicId,
      batch:
        chunk.chunkCount > 1
          ? `${chunk.chunkIndex}/${chunk.chunkCount}`
          : undefined,
      count: chunk.sourceCount,
    },
    context: {
      topic: chunk.topicName,
    },
  });
}

/**
 * Condensed export: url/title/description/age/snippets, ordered by fused score.
 */
export function CondensedAuthorityExportButton({
  topicId,
  topicName,
}: CondensedAuthorityExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [chunkSize, setChunkSize] = useState("50");
  const [snippetLimit, setSnippetLimit] = useState("0");
  const [totalSources, setTotalSources] = useState<number | null>(null);
  const [chunks, setChunks] = useState<CondensedAuthorityChunk[] | null>(null);
  const [cursor, setCursor] = useState(0);

  const size = useMemo(() => parseInt(chunkSize, 10) || 0, [chunkSize]);
  const snippetMaxChars = useMemo(
    () => parseInt(snippetLimit, 10) || 0,
    [snippetLimit],
  );

  const loadChunks = useCallback(async (): Promise<
    CondensedAuthorityChunk[]
  > => {
    const { rows } = await getCurationData(topicId);
    if (rows.length === 0) throw new Error("No sources to export yet.");
    setTotalSources(rows.length);
    const payload = buildCondensedAuthorityExport(topicId, topicName, rows, {
      snippetMaxChars,
    });
    return chunkCondensedAuthorityExport(payload, size);
  }, [topicId, topicName, size, snippetMaxChars]);

  const refreshSourceCount = useCallback(async () => {
    try {
      setTotalSources(await fetchTopicSourceCount(topicId));
    } catch {
      setTotalSources(null);
    }
  }, [topicId]);

  const stepCopy = useCallback(
    async (mode: "ai" | "json") => {
      if (busy) return;
      setBusy(true);
      try {
        let list = chunks;
        let idx = cursor;
        if (!list || idx >= list.length) {
          list = await loadChunks();
          idx = 0;
          setChunks(list);
        }
        const chunk = list[idx];
        const text =
          mode === "ai"
            ? chunkAiText(chunk)
            : condensedAuthorityExportToJson(chunk);
        await writeExportClipboard(text);

        const next = idx + 1;
        setCursor(next);
        const label = mode === "ai" ? "for AI" : "as JSON";
        if (list.length > 1) {
          toast.success(
            `Copied condensed batch ${chunk.chunkIndex}/${chunk.chunkCount} ${label} (${chunk.sourceCount} sources)`,
            {
              description:
                next < list.length
                  ? "Paste into a fresh chat, then click again for the next batch."
                  : "Last batch — paste into a fresh chat to finish.",
            },
          );
        } else {
          toast.success(
            `Copied ${chunk.sourceCount} condensed sources ${label}`,
          );
        }
        if (next >= list.length) setCursor(0);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, chunks, cursor, loadChunks],
  );

  const downloadAll = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const list = await loadChunks();
      list.forEach((chunk, i) => {
        setTimeout(() => {
          const blob = new Blob([condensedAuthorityExportToJson(chunk)], {
            type: "application/json",
          });
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href;
          a.download = condensedAuthorityExportFilename(chunk);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(href);
        }, i * 250);
      });
      toast.success(
        list.length > 1
          ? `Downloading ${list.length} condensed batch files`
          : `Downloaded ${list[0].sourceCount} condensed sources`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }, [busy, loadChunks]);

  const resetExportState = useCallback(
    (updates: { chunkSize?: string; snippetLimit?: string }) => {
      if (updates.chunkSize != null) setChunkSize(updates.chunkSize);
      if (updates.snippetLimit != null) setSnippetLimit(updates.snippetLimit);
      setChunks(null);
      setCursor(0);
    },
    [],
  );

  const inPass = chunks && chunks.length > 1 && cursor > 0;
  const stepSuffix = inPass
    ? ` (next: batch ${cursor + 1}/${chunks.length})`
    : "";

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void refreshSourceCount();
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="gap-1.5 text-xs"
          title="Export condensed sources ordered by research score"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileStack className="h-3.5 w-3.5 text-primary" />
          )}
          Condensed
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground flex items-center justify-between gap-2">
          <span>Batch</span>
          {totalSources != null ? (
            <span className="tabular-nums">{totalSources}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={chunkSize}
          onValueChange={(value) => resetExportState({ chunkSize: value })}
        >
          {AUTHORITY_EXPORT_CHUNK_SIZES.map((opt) => (
            <DropdownMenuRadioItem
              key={opt.value}
              value={opt.value}
              className={EXPORT_MENU_RADIO_CLASS}
              onSelect={(e) => e.preventDefault()}
            >
              {authorityExportBatchLabel(opt.value, totalSources)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Snippet max (chars)
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={snippetLimit}
          onValueChange={(value) => resetExportState({ snippetLimit: value })}
        >
          {CONDENSED_EXPORT_SNIPPET_LIMITS.map((opt) => (
            <DropdownMenuRadioItem
              key={opt.value}
              value={opt.value}
              className={EXPORT_MENU_RADIO_CLASS}
              onSelect={(e) => e.preventDefault()}
            >
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            stepCopy("ai");
          }}
          disabled={busy}
        >
          {inPass ? (
            <Check className="h-3.5 w-3.5 mr-2 text-primary" />
          ) : (
            <Webhook className="h-3.5 w-3.5 mr-2 text-primary" />
          )}
          Copy for AI{stepSuffix}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            stepCopy("json");
          }}
          disabled={busy}
        >
          <Braces className="h-3.5 w-3.5 mr-2" />
          Copy JSON{stepSuffix}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadAll} disabled={busy}>
          <Download className="h-3.5 w-3.5 mr-2" />
          Download JSON{chunks && chunks.length > 1 ? " (all)" : ""}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
