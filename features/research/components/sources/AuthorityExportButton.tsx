"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Award,
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
  buildAuthorityExport,
  chunkAuthorityExport,
  authorityExportToJson,
  authorityExportFilename,
  type AuthorityChunk,
} from "../../utils/authorityExport";
import {
  AUTHORITY_EXPORT_CHUNK_SIZES,
  authorityExportBatchLabel,
  EXPORT_MENU_RADIO_CLASS,
  fetchTopicSourceCount,
  writeExportClipboard,
} from "../../utils/authorityExportMenu";
import { downloadFile } from "@ai-matrx/kit/download";
import { copyNotify } from "@/lib/clipboard/copy-notify";

interface AuthorityExportButtonProps {
  topicId: string;
  topicName: string | null;
}

function chunkAiText(chunk: AuthorityChunk): string {
  const batchNote =
    chunk.chunkCount > 1
      ? ` This is batch ${chunk.chunkIndex} of ${chunk.chunkCount} (${chunk.totalSourceCount} sources total). Score ONLY the ${chunk.sourceCount} sources in this batch.`
      : "";
  return buildAgentPayload({
    kind: "research-source-authority-ranking",
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
      returnSchema: JSON.stringify(chunk.returnSchema),
    },
  });
}

/**
 * Builds an authoritativeness-ranking payload for EVERY source in the topic
 * (not just the current page). Large topics are split into batches the user
 * processes one model call at a time — copy a batch, paste into a fresh chat,
 * collect the JSON, come back and copy the next batch.
 */
export function AuthorityExportButton({
  topicId,
  topicName,
}: AuthorityExportButtonProps) {
  const [busy, setBusy] = useState(false);
  const [chunkSize, setChunkSize] = useState("50");
  const [totalSources, setTotalSources] = useState<number | null>(null);
  const [chunks, setChunks] = useState<AuthorityChunk[] | null>(null);
  const [cursor, setCursor] = useState(0);

  const size = useMemo(() => parseInt(chunkSize, 10) || 0, [chunkSize]);

  const loadChunks = useCallback(async (): Promise<AuthorityChunk[]> => {
    const { rows } = await getCurationData(topicId);
    if (rows.length === 0) throw new Error("No sources to export yet.");
    setTotalSources(rows.length);
    const payload = buildAuthorityExport(topicId, topicName, rows);
    return chunkAuthorityExport(payload, size);
  }, [topicId, topicName, size]);

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
          mode === "ai" ? chunkAiText(chunk) : authorityExportToJson(chunk);
        await writeExportClipboard(text);

        const next = idx + 1;
        setCursor(next);
        const label = mode === "ai" ? "for AI" : "as JSON";
        if (list.length > 1) {
          toast.success(
            `Copied batch ${chunk.chunkIndex}/${chunk.chunkCount} ${label} (${chunk.sourceCount} sources)`,
            {
              description:
                next < list.length
                  ? "Paste into a fresh chat, then click again for the next batch."
                  : "Last batch — paste into a fresh chat to finish.",
            },
          );
        } else {
          copyNotify(`Copied ${chunk.sourceCount} sources ${label}`, "success");
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
          const blob = new Blob([authorityExportToJson(chunk)], {
            type: "application/json",
          });
          downloadFile(authorityExportFilename(chunk), blob, blob.type);
        }, i * 250);
      });
      toast.success(
        list.length > 1
          ? `Downloading ${list.length} batch files`
          : `Downloaded ${list[0].sourceCount} sources`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }, [busy, loadChunks]);

  const resetCursor = useCallback((nextSize: string) => {
    setChunkSize(nextSize);
    setChunks(null);
    setCursor(0);
  }, []);

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
          icon={busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Award className="text-primary" />
          )} iconEnd={<ChevronDown className="opacity-60" />}
          variant="outline"
          disabled={busy}
          title="Export sources for AI authoritativeness ranking"
        >
          Authority export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground flex items-center justify-between gap-2">
          <span>Batch</span>
          {totalSources != null ? (
            <span className="tabular-nums">{totalSources}</span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={chunkSize} onValueChange={resetCursor}>
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
