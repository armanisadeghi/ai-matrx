"use client";

/**
 * AssistCard — the EXPANDED view of one assist: full title (never truncated),
 * readable markdown body, the agent's reasoning when present, and an
 * intentional action row. This is where the Claude-Code bar is enforced:
 * the user reads exactly what will happen, then clicks a verb-labeled
 * button. The card never auto-runs anything.
 */

import { lazy, Suspense, useState } from "react";
import {
  Clock,
  ExternalLink,
  Lightbulb,
  Loader2,
  Quote,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isLowConfidence, SNOOZE_WINDOWS } from "../constants";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAssistRunner } from "../runtime/useAssistRunner";
import { describeAssistAction } from "../runtime/action-descriptors";
import { formatAssistSourceLabel } from "../source-suppression";
import type { Assist } from "../types";

// Markdown loads only when a card actually opens — chips stay feather-light.
const BasicMarkdownContent = lazy(
  () =>
    import("@/components/mardown-display/chat-markdown/BasicMarkdownContent"),
);

const SOURCE_LABEL: Record<Assist["sourceKind"], string> = {
  deterministic: "Noticed by the system",
  agent: "Suggested by AI",
  sweep: "Found by a background review",
  stream: "From a live run",
};

function firstSeenLine(assist: Assist): string | null {
  const seen = assist.firstSeenAt ?? assist.createdAt;
  if (!seen) return null;
  const when = new Date(seen).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (assist.occurrences > 1) {
    return `First noticed ${when} · seen ${assist.occurrences} times since`;
  }
  return `First noticed ${when}`;
}

/**
 * THE RECEIPT — what the system actually saw, so the user can check the claim
 * instead of trusting it. kg-suggestions proved this is the difference between
 * a triaged inbox and an ignored one; `href` keeps THE DOOR LAW (the thing the
 * evidence names is reachable).
 */
function EvidenceBlock({
  evidence,
}: {
  evidence: NonNullable<Assist["evidence"]>;
}) {
  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 text-xs">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Quote className="h-3 w-3 text-muted-foreground" />
        What we saw
        <span className="font-normal text-muted-foreground">
          · {evidence.label ?? evidence.kind}
        </span>
        {evidence.href && (
          <a
            href={evidence.href}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
          >
            Open
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {evidence.snippet && (
        <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap border-l-2 border-border pl-2 text-muted-foreground">
          {evidence.snippet}
        </p>
      )}
      {evidence.items && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
          {evidence.items.slice(0, 8).map((item) => (
            <li key={item}>{item}</li>
          ))}
          {evidence.items.length > 8 && (
            <li className="list-none text-[11px]">
              +{evidence.items.length - 8} more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function AssistCard({
  assist,
  onClose,
}: {
  assist: Assist;
  /** Close the containing popover (after an action, or "Not now"). */
  onClose: () => void;
}) {
  const { acceptAssist, dismissAssist, snoozeAssist, suppressSource } =
    useAssistRunner();
  const [busy, setBusy] = useState<
    "run" | "dismiss" | "snooze" | "silence" | null
  >(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [silenceOpen, setSilenceOpen] = useState(false);
  const [silenceReason, setSilenceReason] = useState("");
  const descriptor = describeAssistAction(assist.action);
  const history = firstSeenLine(assist);
  const sourceLabel = formatAssistSourceLabel(assist.sourceKey);

  const run = async () => {
    if (busy) return;
    setBusy("run");
    try {
      const outcome = await acceptAssist(assist);
      if (outcome.ok) {
        if (descriptor) toast.success(descriptor.receipt);
        onClose();
      }
      // Failures already toast + capture inside the runner; keep the card
      // open so the user still has the context.
    } finally {
      setBusy(null);
    }
  };

  const snooze = async (window: (typeof SNOOZE_WINDOWS)[number]["key"]) => {
    if (busy) return;
    setBusy("snooze");
    try {
      await snoozeAssist(assist, window);
      toast.success("Snoozed — this will come back on its own");
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const dismiss = async () => {
    if (busy) return;
    setBusy("dismiss");
    try {
      await dismissAssist(assist, note);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const silence = async () => {
    if (busy || !silenceReason.trim()) return;
    setBusy("silence");
    try {
      const count = await suppressSource(assist, silenceReason);
      if (count !== null) {
        toast.success(
          `${sourceLabel} is quiet — turn it back on from All assists`,
        );
        onClose();
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex w-full flex-col">
      <div className="flex items-start gap-2 border-b border-border/60 px-3 py-2.5">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug text-foreground">
            {assist.title}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {SOURCE_LABEL[assist.sourceKind]}
            {typeof assist.confidence === "number" &&
              ` · ${Math.round(assist.confidence * 100)}% confident`}
            {isLowConfidence(assist.confidence) && (
              <span className="ml-1 text-amber-600 dark:text-amber-500">
                · low confidence, worth a second look
              </span>
            )}
          </div>
          {history && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {history}
            </div>
          )}
        </div>
      </div>

      {(assist.body ||
        assist.reasoning ||
        assist.evidence ||
        assist.decisionNote) && (
        <div className="max-h-64 overflow-y-auto px-3 py-2 text-sm">
          {assist.body && (
            <Suspense
              fallback={
                <p className="whitespace-pre-wrap text-foreground">
                  {assist.body}
                </p>
              }
            >
              <BasicMarkdownContent
                content={assist.body}
                showCopyButton={false}
              />
            </Suspense>
          )}
          {assist.reasoning && (
            <div className="mt-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Why: </span>
              {assist.reasoning}
            </div>
          )}
          {assist.evidence && <EvidenceBlock evidence={assist.evidence} />}
          {assist.decisionNote && (
            // A row that resurfaces explains itself in the user's own words.
            <div className="mt-2 rounded-md border border-dashed border-border px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Your note: </span>
              {assist.decisionNote}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border/60 px-3 py-2">
        {descriptor ? (
          <p className="mb-2 text-xs text-muted-foreground">
            {descriptor.explainer}
          </p>
        ) : (
          <p className="mb-2 text-xs text-destructive">
            This assist's action type isn't recognized by this version of the
            app.
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={run}
            disabled={!descriptor || busy !== null}
            className="h-7 px-3 text-xs"
          >
            {busy === "run" && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            {descriptor?.verb ?? "Unavailable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            disabled={busy !== null}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Not now
          </Button>
          {assist.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                >
                  {busy === "snooze" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  Later
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SNOOZE_WINDOWS.map((window) => (
                  <DropdownMenuItem
                    key={window.key}
                    onSelect={() => void snooze(window.key)}
                    className="text-xs"
                  >
                    {window.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {assist.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  className="ml-auto h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                >
                  {busy === "dismiss" || busy === "silence" ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <VolumeX className="mr-1 h-3 w-3" />
                  )}
                  Stop showing
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => {
                    setSilenceOpen(false);
                    setSilenceReason("");
                    setNoteOpen(true);
                  }}
                >
                  Just this assist
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => {
                    setNoteOpen(false);
                    setNote("");
                    setSilenceOpen(true);
                  }}
                >
                  Every assist like this
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {noteOpen && assist.id && (
          // Optional, never a gate: the second click dismisses whether or not
          // anything was typed. kg-suggestions' defer-with-note, generalised —
          // "why did I say no" is the thing a resurfacing row must answer.
          <div className="mt-2">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional — why not? (shown if this ever comes back)"
              rows={2}
              autoFocus
              className="min-h-0 text-xs"
            />
            <div className="mt-1 flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2 text-xs"
                disabled={busy !== null}
                onClick={() => void dismiss()}
              >
                Dismiss for good
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                disabled={busy !== null}
                onClick={() => {
                  setNoteOpen(false);
                  setNote("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {silenceOpen && assist.id && (
          <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
            <p className="text-xs text-foreground">
              Hide every current and future <strong>{sourceLabel}</strong>{" "}
              assist. This stays visible in All assists, where you can turn it
              back on.
            </p>
            <Textarea
              value={silenceReason}
              onChange={(event) => setSilenceReason(event.target.value)}
              placeholder="Why should this kind stay quiet?"
              rows={2}
              autoFocus
              className="mt-2 min-h-0 text-xs"
            />
            <div className="mt-1 flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2 text-xs"
                disabled={busy !== null || !silenceReason.trim()}
                onClick={() => void silence()}
              >
                {busy === "silence" && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                )}
                Silence this kind
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                disabled={busy !== null}
                onClick={() => {
                  setSilenceOpen(false);
                  setSilenceReason("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
