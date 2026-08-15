"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RotateCcw,
  Telescope,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import MarkdownStream from "@/components/MarkdownStream";
import { toast } from "@/lib/toast";
import {
  getGoogleBackgroundInteraction,
  startGoogleBackgroundInteraction,
  type GoogleBackgroundInteractionView,
  type GoogleBackgroundModel,
} from "../../service/google-background";

const TERMINAL = new Set(["completed", "failed", "cancelled"]);

function collectStrings(
  value: unknown,
  predicate: (key: string) => boolean,
  key = "",
  found: string[] = [],
): string[] {
  if (typeof value === "string" && predicate(key)) found.push(value);
  else if (Array.isArray(value)) {
    for (const child of value) collectStrings(child, predicate, key, found);
  } else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) {
      collectStrings(child, predicate, childKey, found);
    }
  }
  return found;
}

export function GoogleBackgroundAgentCard({ topicId }: { topicId: string }) {
  const storageKey = `research:google-background:${topicId}`;
  const [model, setModel] = useState<GoogleBackgroundModel>(
    "deep-research-preview-04-2026",
  );
  const [input, setInput] = useState("");
  const [view, setView] = useState<GoogleBackgroundInteractionView | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notifiedExecution = useRef<string | null>(null);

  const poll = useCallback(
    async (executionId: string) => {
      try {
        const next = await getGoogleBackgroundInteraction(executionId);
        setView(next);
        setError(null);
        if (TERMINAL.has(next.status)) {
          localStorage.removeItem(storageKey);
          if (notifiedExecution.current !== next.execution_id) {
            notifiedExecution.current = next.execution_id;
            if (next.status === "completed") {
              toast.success("Google managed agent completed", {
                description: "The final output is ready in this task card.",
              });
            } else {
              toast.error(`Google managed agent ${next.status}`);
            }
          }
        }
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    },
    [storageKey],
  );

  useEffect(() => {
    const executionId = localStorage.getItem(storageKey);
    if (!executionId) return;
    const timer = setTimeout(() => void poll(executionId), 0);
    return () => clearTimeout(timer);
  }, [poll, storageKey]);

  useEffect(() => {
    if (!view || TERMINAL.has(view.status)) return;
    const timer = setInterval(() => void poll(view.execution_id), 5_000);
    return () => clearInterval(timer);
  }, [poll, view]);

  const start = async () => {
    if (!input.trim()) {
      setError("Describe the research or agent task first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await startGoogleBackgroundInteraction({
        model,
        input: input.trim(),
        idempotency_key: crypto.randomUUID(),
      });
      localStorage.setItem(storageKey, next.execution_id);
      notifiedExecution.current = null;
      setView(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  };

  const reports = useMemo(
    () =>
      view
        ? collectStrings(view.outputs, (key) =>
            ["text", "content", "output", "report"].includes(key.toLowerCase()),
          )
        : [],
    [view],
  );
  const links = useMemo(
    () =>
      view
        ? Array.from(
            new Set(
              collectStrings(view.outputs, (key) =>
                ["url", "uri", "link"].includes(key.toLowerCase()),
              ).filter((value) => /^https?:\/\//.test(value)),
            ),
          )
        : [],
    [view],
  );

  return (
    <section className="mb-6 rounded-xl border border-primary/25 bg-primary/[0.03] p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Telescope className="h-4 w-4 text-primary" /> Google managed agents
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Start a long-running research or sandbox agent. Its provider ID,
            progress, and result are checkpointed on the shared runtime spine,
            so this page can reconnect after a refresh or deployment.
          </p>
        </div>
        {view ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] capitalize text-muted-foreground">
            {TERMINAL.has(view.status) ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            )}
            {view.provider_status ?? view.status.replaceAll("_", " ")}
          </span>
        ) : null}
      </div>

      {!view || TERMINAL.has(view.status) ? (
        <div className="grid gap-3 sm:grid-cols-[18rem_minmax(0,1fr)]">
          <label className="space-y-1 text-xs font-medium">
            Agent
            <select
              value={model}
              onChange={(event) =>
                setModel(event.target.value as GoogleBackgroundModel)
              }
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="deep-research-preview-04-2026">
                Deep Research
              </option>
              <option value="deep-research-max-preview-04-2026">
                Deep Research Max
              </option>
              <option value="antigravity-preview-05-2026">
                Antigravity sandbox agent
              </option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            Task
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              placeholder="Research a question and produce a cited report, or describe a coding/browser task…"
              className="w-full resize-y rounded-md border border-input bg-background p-2.5 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={() => void start()}
            >
              {loading ? <Loader2 className="animate-spin" /> : <Play />}
              Start background agent
            </Button>
          </div>
        </div>
      ) : null}

      {view ? (
        <div className="mt-4 space-y-3 border-t border-border/50 pt-4">
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
            <span>
              Execution: <code>{view.execution_id}</code>
            </span>
            {view.interaction_id ? (
              <span>
                Google interaction: <code>{view.interaction_id}</code>
              </span>
            ) : null}
          </div>
          {view.steps.length > 0 ? (
            <ol className="space-y-2">
              {view.steps.map((step, index) => (
                <li
                  key={index}
                  className="rounded-md border border-border/50 bg-background p-2.5 text-xs"
                >
                  <span className="mr-2 font-semibold text-primary">
                    {index + 1}.
                  </span>
                  <span className="whitespace-pre-wrap">
                    {JSON.stringify(step)}
                  </span>
                </li>
              ))}
            </ol>
          ) : !TERMINAL.has(view.status) ? (
            <p className="text-xs text-muted-foreground">
              Queued with Google; waiting for the first observable step…
            </p>
          ) : null}

          {reports.map((report, index) => (
            <article
              key={index}
              className="rounded-lg border border-border/60 bg-background p-4"
            >
              <MarkdownStream content={report} />
            </article>
          ))}
          {links.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {links.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:bg-accent"
                >
                  Open source <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          ) : null}
          {view.error ? (
            <pre className="overflow-x-auto rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
              {JSON.stringify(view.error, null, 2)}
            </pre>
          ) : null}
          {TERMINAL.has(view.status) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setView(null)}
            >
              <RotateCcw /> Start another
            </Button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
