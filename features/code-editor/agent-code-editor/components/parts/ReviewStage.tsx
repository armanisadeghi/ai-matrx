"use client";

/**
 * ReviewStage — the tabbed review UI for an AI edit proposal.
 *
 * Extracted from AICodeEditor.tsx:199-325. Renders:
 *  - Summary row (edit count + diff stats)
 *  - Optional explanation alert
 *  - Tabs: Diff | Original | Preview | Response
 *
 * Pure presentational: parent owns state transitions; we just render.
 *
 * CodeBlock is imported via dynamic import to avoid hauling the whole
 * view/edit infrastructure into this subtree unless the tab is active.
 */

import React from "react";
import dynamic from "next/dynamic";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Rainbow, GitCompare, File, FileCode, FileText } from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import { DiffView } from "./DiffView";
import type { ParseResult } from "../../utils/parseCodeEdits";

const CodeBlock = dynamic(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
  { ssr: false },
);

interface ReviewStageProps {
  currentCode: string;
  modifiedCode: string;
  language: string;
  parsedEdits: ParseResult;
  rawAIResponse: string;
  diffStats: { additions: number; deletions: number } | null;
}

export function ReviewStage({
  currentCode,
  modifiedCode,
  language,
  parsedEdits,
  rawAIResponse,
  diffStats,
}: ReviewStageProps) {
  const editsCount = parsedEdits.edits.length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Review Changes</span>
          <span className="text-xs text-muted-foreground">
            {editsCount} edit{editsCount !== 1 ? "s" : ""}
          </span>
        </div>
        {diffStats && (
          <div className="flex gap-1.5">
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 text-green-600 border-green-600 bg-green-50 dark:bg-green-950/30"
            >
              +{diffStats.additions}
            </Badge>
            <Badge
              variant="outline"
              className="text-[10px] h-5 px-1.5 text-red-600 border-red-600 bg-red-50 dark:bg-red-950/30"
            >
              -{diffStats.deletions}
            </Badge>
          </div>
        )}
      </div>

      {parsedEdits.explanation && (
        <Alert className="mb-2 shrink-0 py-2">
          <Rainbow className="w-3.5 h-3.5 text-primary" />
          <AlertDescription className="text-xs">
            {parsedEdits.explanation}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="diff" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto shrink-0 gap-0">
          <TabsTrigger
            value="diff"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground hover:bg-muted/50 px-2 py-1 text-[11px] gap-1 h-7 font-normal"
          >
            <GitCompare className="w-3 h-3" />
            Diff
          </TabsTrigger>
          <TabsTrigger
            value="original"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground hover:bg-muted/50 px-2 py-1 text-[11px] gap-1 h-7 font-normal"
          >
            <File className="w-3 h-3" />
            Original
          </TabsTrigger>
          <TabsTrigger
            value="after"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground hover:bg-muted/50 px-2 py-1 text-[11px] gap-1 h-7 font-normal"
          >
            <FileCode className="w-3 h-3" />
            Preview
          </TabsTrigger>
          <TabsTrigger
            value="response"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground hover:bg-muted/50 px-2 py-1 text-[11px] gap-1 h-7 font-normal"
          >
            <FileText className="w-3 h-3" />
            Response
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 mt-2 min-h-0 border rounded overflow-hidden bg-background">
          <TabsContent
            value="diff"
            className="h-full m-0 p-0 overflow-hidden"
          >
            <DiffView
              originalCode={currentCode}
              modifiedCode={modifiedCode}
              language={language}
              showLineNumbers={true}
            />
          </TabsContent>

          <TabsContent
            value="original"
            className="h-full m-0 p-0 overflow-hidden"
          >
            <div className="h-full overflow-auto">
              <CodeBlock
                code={currentCode}
                language={language}
                showLineNumbers={true}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="after"
            className="h-full m-0 p-0 overflow-hidden"
          >
            <div className="h-full overflow-auto">
              <CodeBlock
                code={modifiedCode}
                language={language}
                showLineNumbers={true}
              />
            </div>
          </TabsContent>

          <TabsContent
            value="response"
            className="h-full m-0 p-0 overflow-hidden"
          >
            <div className="h-full overflow-auto p-3">
              <MarkdownStream imagePolicy="ai"
                content={rawAIResponse}
                hideCopyButton={false}
                allowFullScreenEditor={false}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
