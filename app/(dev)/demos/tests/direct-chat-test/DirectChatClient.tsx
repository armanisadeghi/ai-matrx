"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { BasicInput } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { get_prompt_sample, TEST_ADMIN_TOKEN } from "./sample-prompt";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import MarkdownStream from "@/components/MarkdownStream";
import { BACKEND_URLS, ENDPOINTS } from "@/lib/api/endpoints";
import { parseNdjsonStream } from "@/lib/api/stream-parser";
import { isChunkEvent } from "@/types/python-generated/stream-events";

type ServerType = "local" | "production";

const PROMPT_OPTIONS = [
  { value: "small_test_prompt", label: "Small Test Prompt" },
  { value: "tools_test_prompt", label: "Tools Test Prompt" },
];

export default function DirectChatClient() {
  const [serverType, setServerType] = useState<ServerType>("production");
  const [authToken, setAuthToken] = useState<string>(TEST_ADMIN_TOKEN);
  const [selectedPrompt, setSelectedPrompt] =
    useState<string>("small_test_prompt");
  const [requestJson, setRequestJson] = useState<string>("");
  const [responseJson, setResponseJson] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamText, setStreamText] = useState<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const getBaseUrl = () => {
    if (serverType === "local") {
      return BACKEND_URLS.localhost;
    }
    return BACKEND_URLS.production;
  };

  // Load prompt when selected
  useEffect(() => {
    if (selectedPrompt) {
      const promptSample = get_prompt_sample(selectedPrompt);
      if (promptSample) {
        // Flatten the structure: spread settings into the root level
        const requestBody = {
          messages: promptSample.messages,
          ...promptSample.settings,
        };
        setRequestJson(JSON.stringify(requestBody, null, 2));
      }
    }
  }, [selectedPrompt]);

  const handleRequestJsonChange = (newCode: string) => {
    setRequestJson(newCode);
  };

  const handleSendRequest = async () => {
    if (!requestJson.trim()) {
      return;
    }

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setResponseJson("");
    setStreamText("");
    setIsStreaming(true);

    try {
      let requestBody;
      try {
        requestBody = JSON.parse(requestJson);
      } catch (e) {
        setResponseJson(
          JSON.stringify({ error: "Invalid JSON in request body" }, null, 2),
        );
        setIsStreaming(false);
        return;
      }

      const url = `${getBaseUrl()}${ENDPOINTS.ai.chat}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        setResponseJson(
          JSON.stringify(
            {
              error: `HTTP ${response.status}`,
              message: errorText,
            },
            null,
            2,
          ),
        );
        setIsStreaming(false);
        return;
      }

      if (!response.body) {
        setResponseJson(JSON.stringify({ error: "No response body" }, null, 2));
        setIsStreaming(false);
        return;
      }

      // Handle streaming response
      const jsonEvents: unknown[] = [];
      const { events } = parseNdjsonStream(
        response,
        abortControllerRef.current?.signal,
      );

      for await (const event of events) {
        jsonEvents.push(event);
        setResponseJson(JSON.stringify(jsonEvents, null, 2));

        if (isChunkEvent(event)) {
          setStreamText((prev) => prev + event.data.text);
        }
      }
    } catch (error: any) {
      if (error.name === "AbortError") {
        setResponseJson(
          (prev) =>
            prev +
            (prev ? "\n\n" : "") +
            JSON.stringify(
              {
                error: "Request aborted",
              },
              null,
              2,
            ),
        );
      } else {
        setResponseJson(
          JSON.stringify(
            {
              error: error.message || "Unknown error",
            },
            null,
            2,
          ),
        );
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-background">
      <div className="flex-1 grid grid-cols-2 gap-3 p-3 pb-safe min-h-0 overflow-hidden">
        {/* Left Column: Controls and JSON */}
        <div className="flex flex-col space-y-3 h-full min-h-0 overflow-hidden">
          <div className="flex-shrink-0 space-y-3">
            <h1 className="text-lg font-bold">Chat API Test</h1>

            {/* Top Row: Server + Auth Token */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant={serverType === "local" ? "default" : "outline"}
                  onClick={() => setServerType("local")}
                  className="h-7 text-xs px-2"
                >
                  Localhost
                </Button>
                <Button
                  size="sm"
                  variant={serverType === "production" ? "default" : "outline"}
                  onClick={() => setServerType("production")}
                  className="h-7 text-xs px-2"
                >
                  Production
                </Button>
              </div>
              <BasicInput
                type="text"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Auth Token"
                className="h-7 text-xs flex-1 max-w-xs"
              />
              <span className="text-xs text-muted-foreground font-mono ml-auto">
                {getBaseUrl()}
              </span>
            </div>

            {/* Prompt Selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold w-24">Prompt:</span>
              <Select value={selectedPrompt} onValueChange={setSelectedPrompt}>
                <SelectTrigger className="h-7 text-xs w-64">
                  <SelectValue placeholder="Select a sample prompt" />
                </SelectTrigger>
                <SelectContent>
                  {PROMPT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 flex flex-col space-y-3 overflow-y-auto min-h-0 pr-1">
            {/* Request JSON */}
            <div className="space-y-1 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Request JSON</span>
                <Button
                  size="sm"
                  onClick={handleSendRequest}
                  disabled={isStreaming || !requestJson.trim()}
                  className="h-7 text-xs px-2"
                >
                  {isStreaming ? (
                    <>
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      Streaming...
                    </>
                  ) : (
                    "Send Request"
                  )}
                </Button>
                {isStreaming && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleStop}
                    className="h-7 text-xs px-2"
                  >
                    Stop
                  </Button>
                )}
              </div>
              <CodeBlock
                code={requestJson || "// Select a prompt or edit JSON manually"}
                language="json"
                fontSize={12}
                showLineNumbers={true}
                wrapLines={true}
                onCodeChange={handleRequestJsonChange}
                allowEdit={true}
              />
            </div>

            {/* Response JSON */}
            <div className="space-y-1 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Response JSON</span>
                {streamText && (
                  <span className="text-xs text-muted-foreground">
                    Stream Text: {streamText.length} chars
                  </span>
                )}
              </div>
              <CodeBlock
                code={responseJson || "// Response will appear here"}
                language="json"
                wrapLines={true}
                allowEdit={false}
                isStreamActive={isStreaming}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Chat Stream Rendering */}
        <div className="flex flex-col overflow-hidden h-full">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h2 className="text-lg font-bold">Chat Stream</h2>
            {streamText && (
              <span className="text-xs text-muted-foreground">
                {streamText.length} chars
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto bg-textured p-3 rounded-md min-h-0">
            {streamText ? (
              <MarkdownStream
                content={streamText}
                isStreamActive={isStreaming}
                className="text-xs"
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                No streaming text yet...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
