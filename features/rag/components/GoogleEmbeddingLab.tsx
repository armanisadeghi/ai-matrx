"use client";

import { useState } from "react";
import { Binary, Check, Clipboard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import {
  createGoogleEmbeddings,
  type GoogleEmbeddingRequest,
  type GoogleEmbeddingResponse,
} from "@/features/rag/api/google-embeddings";

export function GoogleEmbeddingLab() {
  const [model, setModel] =
    useState<GoogleEmbeddingRequest["model"]>("gemini-embedding-2");
  const [dimensions, setDimensions] = useState(1536);
  const [taskType, setTaskType] =
    useState<NonNullable<GoogleEmbeddingRequest["task_type"]>>(
      "RETRIEVAL_DOCUMENT",
    );
  const [text, setText] = useState("");
  const [uri, setUri] = useState("");
  const [mimeType, setMimeType] = useState("");
  const [result, setResult] = useState<GoogleEmbeddingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0 && !uri.trim()) {
      setError("Enter text or a provider-readable media URI.");
      return;
    }
    if (model === "gemini-embedding-001" && uri.trim()) {
      setError(
        "gemini-embedding-001 is text-only. Choose Gemini Embedding 2 for media.",
      );
      return;
    }

    const inputs: GoogleEmbeddingRequest["inputs"] = uri.trim()
      ? [
          [
            ...lines.map((line) => ({ type: "text" as const, text: line })),
            {
              type: "uri" as const,
              uri: uri.trim(),
              ...(mimeType.trim() ? { mime_type: mimeType.trim() } : {}),
            },
          ],
        ]
      : lines;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await createGoogleEmbeddings({
          model,
          inputs,
          output_dimensionality: dimensions,
          task_type: taskType,
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <RagHubHeader />
      <main className="matrx-touch-targets h-full overflow-auto bg-background">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-7 sm:px-6">
          <header>
            <h1 className="flex items-center gap-2 text-xl font-semibold">
              <Binary className="h-5 w-5 text-primary" /> Gemini embedding lab
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Test the same catalog-routed Gemini embedding runtime available to
              the knowledge pipeline. Gemini Embedding 2 accepts text and
              provider-readable image, audio, video, or PDF URIs.
            </p>
          </header>

          <section className="grid gap-4 rounded-xl border border-border/60 bg-card p-4 sm:grid-cols-3">
            <label className="space-y-1 text-xs font-medium">
              Model
              <select
                value={model}
                onChange={(event) =>
                  setModel(
                    event.target.value as GoogleEmbeddingRequest["model"],
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="gemini-embedding-2">Gemini Embedding 2</option>
                <option value="gemini-embedding-001">
                  Gemini Embedding 001
                </option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              Dimensions
              <select
                value={dimensions}
                onChange={(event) => setDimensions(Number(event.target.value))}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value={768}>768</option>
                <option value={1536}>1536 (knowledge index)</option>
                <option value={3072}>3072</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              Task
              <select
                value={taskType}
                onChange={(event) =>
                  setTaskType(
                    event.target.value as NonNullable<
                      GoogleEmbeddingRequest["task_type"]
                    >,
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="RETRIEVAL_DOCUMENT">Retrieval document</option>
                <option value="RETRIEVAL_QUERY">Retrieval query</option>
                <option value="SEMANTIC_SIMILARITY">Semantic similarity</option>
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium sm:col-span-3">
              Text inputs{" "}
              <span className="font-normal text-muted-foreground">
                (one vector per line)
              </span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={7}
                placeholder="Paste one or more passages, one per line…"
                className="w-full resize-y rounded-md border border-input bg-background p-3 font-mono text-sm"
              />
            </label>

            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              Optional media URI
              <input
                value={uri}
                onChange={(event) => setUri(event.target.value)}
                placeholder="gs://… or a Google Files API URI"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              MIME type
              <input
                value={mimeType}
                onChange={(event) => setMimeType(event.target.value)}
                placeholder="application/pdf"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>

            <div className="sm:col-span-3">
              <Button
                type="button"
                onClick={() => void run()}
                disabled={running}
              >
                {running ? <Loader2 className="animate-spin" /> : <Binary />}
                Generate vectors
              </Button>
            </div>
          </section>

          {error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {result ? (
            <section className="rounded-xl border border-border/60 bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">
                    {result.vectors.length} vector
                    {result.vectors.length === 1 ? "" : "s"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {result.model} · {result.dimensions} dimensions
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard.writeText(
                      JSON.stringify(result.vectors),
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check /> : <Clipboard />}
                  {copied ? "Copied" : "Copy all vectors"}
                </Button>
              </div>
              <div className="space-y-2">
                {result.vectors.map((vector, index) => (
                  <pre
                    key={index}
                    className="overflow-x-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed"
                  >
                    [
                    {vector
                      .slice(0, 12)
                      .map((value) => value.toFixed(6))
                      .join(", ")}
                    {vector.length > 12 ? ", …" : ""}]
                  </pre>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>
    </>
  );
}
