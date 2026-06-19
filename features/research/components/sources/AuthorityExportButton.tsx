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
import { toast } from "sonner";
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

interface AuthorityExportButtonProps {
  topicId: string;
  topicName: string | null;
}

/** Chunk-size choices. 0 = "All in one". */
const CHUNK_SIZES = [
  { value: "25", label: "25 per batch (safest)" },
  { value: "50", label: "50 per batch (recommended)" },
  { value: "0", label: "All in one" },
];

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
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
  // Cached batches + cursor for the step-through copy flow. Rebuilt whenever
  // the cursor wraps back to the start or the chunk size changes.
  const [chunks, setChunks] = useState<AuthorityChunk[] | null>(null);
  const [cursor, setCursor] = useState(0);

  const size = useMemo(() => parseInt(chunkSize, 10) || 0, [chunkSize]);

  const loadChunks = useCallback(async (): Promise<AuthorityChunk[]> => {
    const { rows } = await getCurationData(topicId);
    if (rows.length === 0) throw new Error("No sources to export yet.");
    const payload = buildAuthorityExport(topicId, topicName, rows);
    return chunkAuthorityExport(payload, size);
  }, [topicId, topicName, size]);

  // Copy-for-AI / Copy-JSON, advancing through batches one click at a time.
  const stepCopy = useCallback(
    async (mode: "ai" | "json") => {
      if (busy) return;
      setBusy(true);
      try {
        let list = chunks;
        let idx = cursor;
        // (Re)load at the start of a pass or after the size changed.
        if (!list || idx >= list.length) {
          list = await loadChunks();
          idx = 0;
          setChunks(list);
        }
        const chunk = list[idx];
        const text =
          mode === "ai" ? chunkAiText(chunk) : authorityExportToJson(chunk);
        await writeClipboard(text);

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
          toast.success(`Copied ${chunk.sourceCount} sources ${label}`);
        }
        if (next >= list.length) setCursor(0); // wrap for the next pass
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
        // Stagger so the browser doesn't suppress multiple downloads.
        setTimeout(() => {
          const blob = new Blob([authorityExportToJson(chunk)], {
            type: "application/json",
          });
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href;
          a.download = authorityExportFilename(chunk);
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(href);
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

  // Label the step-copy actions with progress when mid-pass.
  const inPass = chunks && chunks.length > 1 && cursor > 0;
  const stepSuffix = inPass
    ? ` (next: batch ${cursor + 1}/${chunks.length})`
    : "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className="gap-1.5 text-xs"
          title="Export sources for AI authoritativeness ranking"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Award className="h-3.5 w-3.5 text-primary" />
          )}
          Authority export
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Batch size
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup value={chunkSize} onValueChange={resetCursor}>
          {CHUNK_SIZES.map((opt) => (
            <DropdownMenuRadioItem
              key={opt.value}
              value={opt.value}
              className="text-xs"
            >
              {opt.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Rank source authoritativeness
        </DropdownMenuLabel>
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
          Download JSON{chunks && chunks.length > 1 ? " (all batches)" : ""}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
