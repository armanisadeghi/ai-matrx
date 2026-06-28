// Phase 6 wrapper — replaced in Phase 15
"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Stars,
  CheckCircle2,
  AlertCircle,
  Code2,
  FileCode,
  FileText,
  Copy,
  Check,
  File,
  GitCompare,
} from "lucide-react";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import MarkdownStream from "@/components/MarkdownStream";
import { DiffView } from "./DiffView";
import { SmartPromptInput } from "@/features/prompts/components/smart/SmartPromptInput";
import { cn } from "@/lib/utils";
import {
  useAICodeEditor,
  type UseAICodeEditorProps,
} from "@/features/code-editor/hooks/useAICodeEditor";
import {
  PROMPT_BUILTINS,
  type PromptBuiltin,
} from "@/features/agents/constants/system-agent-registry";

export type AICodeEditorProps = UseAICodeEditorProps & {
  title?: string;
  allowPromptSelection?: boolean;
  showHeader?: boolean;
  className?: string;
};

export function AICodeEditor({
  open,
  onOpenChange,
  currentCode,
  language: rawLanguage,
  builtinId,
  promptKey = "generic-code-editor",
  onCodeChange,
  title = "AI Code Editor",
  allowPromptSelection = false,
  showHeader = true,
  className,
  selection,
  context,
}: AICodeEditorProps) {
  const {
    state,
    setState,
    parsedEdits,
    modifiedCode,
    errorMessage,
    rawAIResponse,
    isCopied,
    selectedBuiltinId,
    setSelectedBuiltinId,
    isExecuting,
    isLoadingPrompt,
    diffStats,
    displayVariables,
    language,
    streamingText,
    messages,
    handleVariableValueChange,
    handleSubmitOnEnterChange,
    handleCopyResponse,
    handleApplyChanges,
    runId,
  } = useAICodeEditor({
    open,
    onOpenChange,
    currentCode,
    language: rawLanguage,
    builtinId,
    promptKey,
    onCodeChange,
    selection,
    context,
  });

  // Get available builtins for the selector
  const availableBuiltins = Object.values(PROMPT_BUILTINS) as PromptBuiltin[];

  // Memoize CodeBlock to prevent re-rendering
  const memoizedCodeDisplay = useMemo(
    () => (
      <>
        <div className="px-2 py-1 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Current Code
          </span>
        </div>
        <div className="flex-1 overflow-auto relative">
          <CodeBlock
            code={currentCode}
            language={language}
            showLineNumbers={true}
          />
        </div>
      </>
    ),
    [currentCode, language],
  );

  return (
    <div className={cn("h-full flex flex-col overflow-hidden", className)}>
      {/* Compact Header - Only show when needed */}
      {showHeader && (allowPromptSelection || title !== "AI Code Editor") && (
        <div className="px-3 py-2 border-b shrink-0 bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            {title !== "AI Code Editor" && (
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="truncate">{title}</span>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {allowPromptSelection && (
                <Select
                  value={selectedBuiltinId}
                  onValueChange={setSelectedBuiltinId}
                  disabled={isLoadingPrompt}
                >
                  <SelectTrigger className="w-[160px] h-7 text-xs">
                    <SelectValue placeholder="Select mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBuiltins.map((builtin) => (
                      <SelectItem
                        key={builtin.id}
                        value={builtin.id}
                        className="text-xs"
                      >
                        {builtin.name} ({builtin.key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Two-column layout */}
      <div className="flex-1 overflow-hidden min-h-0 flex gap-2 p-2">
        {/* Left: Main Content Area (changes based on state) */}
        <div
          className={cn(
            "flex flex-col min-h-0 gap-2",
            messages && messages.length > 0 ? "flex-[2] min-w-0" : "flex-1",
          )}
        >
          {/* Code Display (input/processing states) */}
          {(state === "input" || state === "processing") && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background relative">
              {memoizedCodeDisplay}

              {/* Processing Overlay - Compact */}
              {state === "processing" && (
                <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                  <Loader2 className="w-10 h-10 animate-spin text-primary mb-3" />
                  <p className="text-sm font-medium">AI is responding...</p>

                  {streamingText && (
                    <div className="mt-4 w-full max-w-xl px-4">
                      <div className="bg-muted/50 rounded border p-2 max-h-[450px] overflow-y-auto font-mono text-[10px]">
                        <p className="text-muted-foreground mb-1 text-[9px] uppercase tracking-wider font-semibold">
                          Live Response
                        </p>
                        <MarkdownStream content={streamingText} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Review Stage */}
          {state === "review" && parsedEdits && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">Review Changes</span>
                  <span className="text-xs text-muted-foreground">
                    {parsedEdits.edits.length} edit
                    {parsedEdits.edits.length !== 1 ? "s" : ""}
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
                  <Stars className="w-3.5 h-3.5 text-primary" />
                  <AlertDescription className="text-xs">
                    {parsedEdits.explanation}
                  </AlertDescription>
                </Alert>
              )}

              <Tabs
                defaultValue="diff"
                className="flex-1 flex flex-col min-h-0"
              >
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
                      <MarkdownStream
                        content={rawAIResponse}
                        hideCopyButton={false}
                        allowFullScreenEditor={false}
                      />
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          )}

          {/* Applying Stage - Compact */}
          {state === "applying" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
                <p className="text-sm font-medium">Applying Changes...</p>
              </div>
            </div>
          )}

          {/* Complete Stage - Compact */}
          {state === "complete" && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium">Changes Applied!</p>
              </div>
            </div>
          )}

          {/* Error Stage - Compact */}
          {state === "error" && (
            <div className="flex-1 flex flex-col min-h-0 gap-2">
              <Alert variant="destructive" className="shrink-0 py-2">
                <AlertCircle className="w-3.5 h-3.5" />
                <AlertDescription className="text-xs font-medium">
                  Failed to process AI response
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 flex-1 min-h-0">
                <div className="border rounded p-2 overflow-auto bg-destructive/5">
                  <h4 className="font-semibold text-destructive mb-1 text-xs">
                    Error Details
                  </h4>
                  <pre className="text-[10px] whitespace-pre-wrap font-mono text-destructive/80">
                    {errorMessage}
                  </pre>
                </div>

                <div className="border rounded flex flex-col overflow-hidden">
                  <div className="px-2 py-1 bg-muted/50 border-b flex items-center justify-between shrink-0">
                    <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                      Raw AI Response
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5"
                      onClick={handleCopyResponse}
                      disabled={!rawAIResponse}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3 h-3 mr-1 text-green-600" />
                          <span className="text-[10px]">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 mr-1" />
                          <span className="text-[10px]">Copy</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="flex-1 overflow-auto p-2 bg-background">
                    <pre className="text-[10px] whitespace-pre-wrap font-mono">
                      {rawAIResponse}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Persistent Conversation Panel */}
        {messages && messages.length > 0 && (
          <div className="flex-1 min-w-[280px] max-w-[400px] flex flex-col min-h-0 border rounded overflow-hidden bg-background">
            <div className="px-2 py-1 border-b bg-muted/20 shrink-0">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Conversation
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "p-2 rounded text-xs",
                    msg.role === "user"
                      ? "bg-primary/10 ml-4"
                      : "bg-muted mr-4",
                  )}
                >
                  <div className="font-semibold text-[10px] uppercase tracking-wide mb-1 text-muted-foreground">
                    {msg.role === "user"
                      ? "You"
                      : msg.role === "assistant"
                        ? "Assistant"
                        : msg.role === "system"
                          ? "System"
                          : msg.role === "tool"
                            ? "Tool"
                            : msg.role === "function"
                              ? "Function"
                              : "Unknown"}
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {typeof msg.content === "string"
                      ? msg.content
                      : JSON.stringify(msg.content)}
                  </div>
                </div>
              ))}
              {/* Show streaming response in conversation */}
              {isExecuting && streamingText && (
                <div className="p-2 rounded text-xs bg-muted mr-4 animate-pulse">
                  <div className="font-semibold text-[10px] uppercase tracking-wide mb-1 text-muted-foreground">
                    Assistant
                  </div>
                  <div className="whitespace-pre-wrap break-words">
                    {streamingText}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Fixed Footer - Input Area - Compact */}
      <div className="px-2 py-2 border-t shrink-0 bg-background z-20">
        <div className="w-full">
          {state === "review" ? (
            <div className="flex items-center justify-between w-full">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setState("input")}
              >
                Retry
              </Button>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setState("input")}
                >
                  Discard
                </Button>
                <Button
                  size="sm"
                  onClick={handleApplyChanges}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  Apply
                </Button>
              </div>
            </div>
          ) : state === "error" ? (
            <div className="flex justify-end w-full">
              <Button size="sm" onClick={() => setState("input")}>
                Continue Conversation
              </Button>
            </div>
          ) : (
            /* Input State - Show SmartPromptInput */
            <>
              {isLoadingPrompt ? (
                <div className="h-[50px] flex items-center justify-center text-muted-foreground text-sm">
                  Initializing editor...
                </div>
              ) : runId ? (
                <div className="w-full">
                  <SmartPromptInput
                    runId={runId}
                    placeholder="Describe the changes you want to make..."
                    sendButtonVariant="default"
                    uploadBucket="userContent"
                    uploadPath="code-editor-attachments"
                    enablePasteImages={true}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
