"use client";

import { useCallback, useState } from "react";
import {
  ChevronDown,
  Download,
  FileText,
  Webhook,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
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

interface CrossCuttingTagsExportButtonProps {
  topicId: string;
  topicName: string | null;
}

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
        await writeClipboard(text);
        toast.success(
          mode === "ai" ? "Copied tag input for AI" : "Copied tag input",
          {
            description:
              "Paste into the Cross-Cutting Tag Generator agent, then add your own prompt at the end to steer it.",
          },
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
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = tagInputExportFilename(topicId, topicName);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(href);
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
          variant="outline"
          size="sm"
          disabled={busy}
          className="gap-1.5 text-xs"
          title="Export the agent input so you can run the Cross-Cutting Tag Generator yourself"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          Export search results
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Run the agent yourself
        </DropdownMenuLabel>
        <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
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
