"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageSquare, Play, RefreshCw } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { LocalToolsPageShell } from "../_lib/LocalToolsPageShell";
import { useMatrxLocalContext } from "../_lib/MatrxLocalContext";

type StreamMode = "openai" | "matrx";

interface RunState {
  running: boolean;
  status: string;
  text: string;
  raw: string[];
  error: string | null;
}

const initialRunState: RunState = {
  running: false,
  status: "idle",
  text: "",
  raw: [],
  error: null,
};

async function authHeaders(extra?: Record<string, string>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function parseOpenAiDelta(rawLine: string): string {
  const line = rawLine.trim();
  if (!line.startsWith("data:")) return "";
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return "";
  try {
    const parsed = JSON.parse(data);
    const delta = parsed?.choices?.[0]?.delta;
    return String(delta?.content ?? delta?.reasoning_content ?? "");
  } catch {
    return "";
  }
}

function parseMatrxDelta(rawLine: string): string {
  const line = rawLine.trim();
  const data = line.startsWith("data:") ? line.slice(5).trim() : line;
  if (!data || data === "[DONE]") return "";
  try {
    const parsed = JSON.parse(data);
    if (parsed?.e === "c" && typeof parsed?.t === "string") return parsed.t;
    if (parsed?.type === "content" && typeof parsed?.content === "string") {
      return parsed.content;
    }
    if (parsed?.delta && typeof parsed.delta === "string") return parsed.delta;
    return "";
  } catch {
    return "";
  }
}

export default function LocalChatTestPage() {
  const local = useMatrxLocalContext();
  const [prompt, setPrompt] = useState(
    "Reply with one short sentence confirming the local model path is working.",
  );
  const [model, setModel] = useState("local/gemma-4-31B-it-Q4_K_M");
  const [matrxBody, setMatrxBody] = useState(() =>
    JSON.stringify(
      {
        ai_model_id: "local/gemma-4-31B-it-Q4_K_M",
        messages: [
          {
            role: "user",
            content:
              "Reply with one short sentence confirming Matrx /ai/chat is streaming.",
          },
        ],
        stream: true,
        store: false,
        // conversation_id / is_new / store are all required on a start request.
        conversation_id: "00000000-0000-4000-8000-000000000001",
        is_new: true,
        client: { surface: "matrx-user/chat" },
      },
      null,
      2,
    ),
  );
  const [openAiRun, setOpenAiRun] = useState<RunState>(initialRunState);
  const [matrxRun, setMatrxRun] = useState<RunState>(initialRunState);

  const openAiBody = useMemo(
    () => ({
      model,
      stream: true,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 256,
    }),
    [model, prompt],
  );

  const runStream = async (
    mode: StreamMode,
    path: string,
    body: unknown,
    setRun: (updater: (prev: RunState) => RunState) => void,
  ) => {
    setRun(() => ({ ...initialRunState, running: true, status: "connecting" }));
    try {
      const res = await fetch(`${local.baseUrl}${path}`, {
        method: "POST",
        headers: await authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
      }
      if (!res.body) throw new Error("Response did not include a stream body");

      setRun((prev) => ({ ...prev, status: "streaming" }));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const delta =
            mode === "openai" ? parseOpenAiDelta(line) : parseMatrxDelta(line);
          setRun((prev) => ({
            ...prev,
            raw: [...prev.raw.slice(-199), line],
            text: delta ? prev.text + delta : prev.text,
          }));
        }
      }

      if (buffer.trim()) {
        const delta =
          mode === "openai"
            ? parseOpenAiDelta(buffer)
            : parseMatrxDelta(buffer);
        setRun((prev) => ({
          ...prev,
          raw: [...prev.raw.slice(-199), buffer],
          text: delta ? prev.text + delta : prev.text,
        }));
      }
      setRun((prev) => ({ ...prev, running: false, status: "complete" }));
    } catch (err) {
      setRun((prev) => ({
        ...prev,
        running: false,
        status: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  const runOpenAi = () =>
    runStream("openai", "/v1/chat/completions", openAiBody, setOpenAiRun);

  const runMatrx = () => {
    try {
      runStream("matrx", "/ai/chat", JSON.parse(matrxBody), setMatrxRun);
    } catch (err) {
      setMatrxRun({
        ...initialRunState,
        status: "error",
        error: err instanceof Error ? err.message : "Invalid JSON",
      });
    }
  };

  return (
    <LocalToolsPageShell>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3">
        <div className="max-w-screen-2xl mx-auto grid grid-cols-1 xl:grid-cols-2 gap-3">
          <section className="border rounded-lg bg-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">OpenAI Compat Stream</h2>
                <Badge variant="secondary" className="h-5 text-[10px]">
                  POST /v1/chat/completions
                </Badge>
              </div>
              <Button
                size="sm"
                onClick={runOpenAi}
                disabled={openAiRun.running}
                className="h-8 gap-1.5"
              >
                {openAiRun.running ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run
              </Button>
            </div>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full h-8 rounded border bg-background px-2 text-xs font-mono"
              spellCheck={false}
            />
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-24 rounded border bg-background p-2 text-xs"
              spellCheck={false}
            />
            <RunOutput run={openAiRun} request={openAiBody} />
          </section>

          <section className="border rounded-lg bg-card p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold">Matrx Chat Stream</h2>
                <Badge variant="secondary" className="h-5 text-[10px]">
                  POST /ai/chat
                </Badge>
              </div>
              <Button
                size="sm"
                onClick={runMatrx}
                disabled={matrxRun.running}
                className="h-8 gap-1.5"
              >
                {matrxRun.running ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                Run
              </Button>
            </div>
            <textarea
              value={matrxBody}
              onChange={(e) => setMatrxBody(e.target.value)}
              className="w-full h-44 rounded border bg-background p-2 text-xs font-mono"
              spellCheck={false}
            />
            <RunOutput
              run={matrxRun}
              request={safeJson(matrxBody) ?? matrxBody}
            />
          </section>
        </div>
      </div>
    </LocalToolsPageShell>
  );
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function RunOutput({ run, request }: { run: RunState; request: unknown }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
      <div className="lg:col-span-1 rounded border bg-background p-2 min-h-40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Request
          </span>
          <Badge variant="outline" className="h-5 text-[10px]">
            {run.status}
          </Badge>
        </div>
        <pre className="text-[10px] whitespace-pre-wrap break-words">
          {JSON.stringify(request, null, 2)}
        </pre>
      </div>
      <div className="lg:col-span-2 rounded border bg-background p-2 min-h-40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Output
          </span>
          {run.error ? (
            <Badge variant="destructive" className="h-5 text-[10px]">
              error
            </Badge>
          ) : null}
        </div>
        {run.error ? (
          <pre className="text-xs text-red-600 whitespace-pre-wrap break-words">
            {run.error}
          </pre>
        ) : (
          <pre className="text-xs whitespace-pre-wrap break-words">
            {run.text || "No text parsed yet"}
          </pre>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-muted-foreground">
            Raw stream ({run.raw.length})
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto text-[10px] whitespace-pre-wrap break-words">
            {run.raw.join("\n")}
          </pre>
        </details>
      </div>
    </div>
  );
}
