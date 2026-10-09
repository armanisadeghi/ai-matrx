"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useCallback, useState } from "react";
import {
  ChevronDown,
  Download,
  FileText,
  Webhook,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useResearchApi } from "../../hooks/useResearchApi";
import {
  tagInputToText,
  tagInputToAiText,
  tagInputExportFilename,
} from "../../utils/tagInputExport";
import { downloadFile } from "@ai-matrx/kit/download";

interface CrossCuttingTagsExportButtonProps {
  topicId: string;
  topicName: string | null;
}

/**
 * Exports the EXACT input the Cross-Cutting Tag Generator agent receives — the
 * topic's keyword list plus its search results — so the user can run that agent
 * by hand instead of (or as well as) the in-app generator. Mirrors the
 * AuthorityExportButton pattern: Copy for AI / Copy text / Download.
 *
 * Every agent also accepts a trailing user prompt, so a user can paste this and
 * append their own steer at the end.
 */
export function CrossCuttingTagsExportButton({
  topicId,
  topicName,
}: CrossCuttingTagsExportButtonProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const api = useResearchApi();
  const [busy, setBusy] = useState(false);

  const copyFor = useCallback(
    async (mode: "ai" | "text") => {
      if (busy) return;
      setBusy(true);
      try {
        const data = await api.getTagInputExport(topicId);
        if (!data.keywords_text.trim() && !data.search_results_text.trim()) {
          throw new Error("Nothing to export yet — add keywords and run a search first.");
        }
        const text =
          mode === "ai"
            ? tagInputToAiText(topicId, topicName, data)
            : tagInputToText(topicName, data);
        await copyText(
          text,
          mode === "ai"
            ? "Copied tag input for AI — paste into the Cross-Cutting Tag Generator"
            : "Copied tag input — paste into the Cross-Cutting Tag Generator",
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Export failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, api, topicId, topicName],
  );

  const download = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = await api.getTagInputExport(topicId);
      if (!data.keywords_text.trim() && !data.search_results_text.trim()) {
        throw new Error("Nothing to export yet — add keywords and run a search first.");
      }
      const blob = new Blob([tagInputToText(topicName, data)], {
        type: "text/plain",
      });
      downloadFile(tagInputExportFilename(topicId, topicName), blob, blob.type);
      toast.success("Downloaded tag input");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }, [busy, api, topicId, topicName]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={busy ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Upload className="text-muted-foreground" />
          )} iconEnd={<ChevronDown className="opacity-60" />}
          variant="outline"
          disabled={busy}
          title="Export the agent input so you can run the Cross-Cutting Tag Generator yourself"
        >
          Export search results
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Run the agent yourself
        </DropdownMenuLabel>
        <p className="px-2 pb-1.5 type-meta leading-snug text-muted-foreground">
          You can paste this into the Cross-Cutting Tag Generator agent yourself,
          and add your own prompt at the end to steer it.
        </p>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            copyFor("ai");
          }}
          disabled={busy}
        >
          <Webhook className="h-3.5 w-3.5 mr-2 text-primary" />
          Copy for AI
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(e) => {
            e.preventDefault();
            copyFor("text");
          }}
          disabled={busy}
        >
          <FileText className="h-3.5 w-3.5 mr-2" />
          Copy text
        </DropdownMenuItem>
        <DropdownMenuItem onClick={download} disabled={busy}>
          <Download className="h-3.5 w-3.5 mr-2" />
          Download
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
