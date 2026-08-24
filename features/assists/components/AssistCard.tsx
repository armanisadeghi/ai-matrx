"use client";

/**
 * AssistCard — the EXPANDED view of one assist: full title (never truncated),
 * readable markdown body, the agent's reasoning when present, and an
 * intentional action row. This is where the Claude-Code bar is enforced:
 * the user reads exactly what will happen, then clicks a verb-labeled
 * button. The card never auto-runs anything.
 */

import { lazy, Suspense, useState } from "react";
import { Clock, ExternalLink, Loader2, Quote, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isLowConfidence, SNOOZE_WINDOWS } from "../constants";
import { QUIET_FOREVER, QUIET_WINDOWS, quietUntil } from "../quiet";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAssistRunner } from "../runtime/useAssistRunner";
import { describeAssistAction } from "../runtime/action-descriptors";
import { getAssistActionTextEditor } from "../runtime/action-editing";
import { formatAssistSourceLabel } from "../source-suppression";
import { AssistActionTextEditor } from "./AssistActionTextEditor";
import { ASSIST_URGENCY_ICON } from "./urgency-icon";
import {
  ASSIST_URGENCY_META,
  urgencyFromPriority,
  type Assist,
} from "../types";

// Markdown loads only when a card actually opens — chips stay feather-light.
const BasicMarkdownContent = lazy(
  () =>
    import("@/components/mardown-display/chat-markdown/BasicMarkdownContent"),
);

function compactMetaLine(assist: Assist): string | null {
  const parts: string[] = [];
  if (typeof assist.confidence === "number") {
    parts.push(`${Math.round(assist.confidence * 100)}%`);
  }
  const seen = assist.firstSeenAt ?? assist.createdAt;
  if (seen) {
    parts.push(
      new Date(seen).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
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
            className="ml-auto inline-flex items-center gap-1 text-primary "
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
  const actionEditor = getAssistActionTextEditor(assist.action);
  const [actionEditOpen, setActionEditOpen] = useState(false);
  const [actionReviewed, setActionReviewed] = useState(false);
  const [actionDraft, setActionDraft] = useState(
    actionEditor ? actionEditor.value : "",
  );
  const descriptor = describeAssistAction(assist.action);
  const urgency = urgencyFromPriority(assist.priority);
  const urgencyMeta = ASSIST_URGENCY_META[urgency];
  const UrgencyIcon = ASSIST_URGENCY_ICON[urgency];
  const compactMeta = compactMetaLine(assist);
  const sourceLabel = formatAssistSourceLabel(assist.sourceKey);
  const actionValidation = actionEditor?.validate(actionDraft) ?? null;
  const actionToRun =
    actionEditor && !actionValidation
      ? actionEditor.apply(actionDraft)
      : assist.action;

  const openActionEditor = () => {
    setActionReviewed(true);
    setActionEditOpen(true);
  };

  const run = async () => {
    if (busy) return;
    if (actionEditor && !actionReviewed) {
      openActionEditor();
      return;
    }
    setBusy("run");
    try {
      const outcome = await acceptAssist({ ...assist, action: actionToRun });
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

  /** Quiet this whole kind until the user reverses it — reason required. */
  const silenceForever = async () => {
    if (busy || !silenceReason.trim()) return;
    setBusy("silence");
    try {
      const count = await suppressSource(assist, silenceReason, QUIET_FOREVER);
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

  /**
   * Quiet this whole kind for a window. No reason is asked for: a mute that
   * reverses itself needs no record for the future to interpret, and a form in
   * front of "quiet for an hour" is how a control stops being used.
   */
  const quietKindFor = async (windowKey: string, label: string) => {
    if (busy) return;
    setBusy("silence");
    try {
      const count = await suppressSource(assist, "", quietUntil(windowKey));
      if (count !== null) {
        toast.success(
          `${sourceLabel} assists are quiet for ${label.toLowerCase()}`,
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
        <UrgencyIcon
          className={cn("mt-0.5 h-4 w-4 shrink-0", urgencyMeta.iconClass)}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug text-foreground">
            {assist.title}
          </div>
          {urgency !== "normal" && (
            // The word, not just the colour — and it says what it means
            // rather than leaving a red border to be interpreted.
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  urgencyMeta.badgeClass,
                )}
              >
                {urgencyMeta.label}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {urgencyMeta.note}
              </span>
            </div>
          )}
          {compactMeta && (
            <div
              className={cn(
                "mt-1 text-[11px] tabular-nums text-muted-foreground",
                isLowConfidence(assist.confidence) &&
                  "text-amber-600 dark:text-amber-500",
              )}
            >
              {compactMeta}
            </div>
          )}
        </div>
      </div>

      {(assist.body ||
        assist.reasoning ||
        assist.evidence ||
        assist.decisionNote) && (
        <div className="px-3 py-2 text-sm md:max-h-64 md:overflow-y-auto">
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
        {actionEditor && (
          <AssistActionTextEditor
            definition={actionEditor}
            value={actionDraft}
            open={actionEditOpen}
            disabled={busy !== null}
            onChange={setActionDraft}
            onOpenChange={(open) => {
              if (open) setActionReviewed(true);
              setActionEditOpen(open);
            }}
            onReset={() => setActionDraft(actionEditor.value)}
          />
        )}
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
        <div className="grid grid-cols-4 items-center gap-1 md:flex md:flex-wrap md:gap-x-2 md:gap-y-1">
          <Button
            size="sm"
            onClick={run}
            disabled={!descriptor || busy !== null || Boolean(actionValidation)}
            className="min-h-11 min-w-0 gap-1 px-1 text-[11px] md:h-7 md:min-h-0 md:px-3 md:text-xs"
            title={
              actionEditor && !actionReviewed
                ? "Review the exact text before approving"
                : descriptor?.verb
            }
          >
            {busy === "run" && (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            )}
            <span className="truncate">
              {actionEditor && !actionReviewed
                ? "Review text"
                : (descriptor?.verb ?? "Unavailable")}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            disabled={busy !== null}
            className="min-h-11 min-w-0 px-1 text-[11px] text-muted-foreground md:h-7 md:min-h-0 md:px-2 md:text-xs"
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
                  className="min-h-11 min-w-0 gap-1 px-1 text-[11px] text-muted-foreground md:h-7 md:min-h-0 md:px-2 md:text-xs"
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
                  className="min-h-11 min-w-0 gap-1 px-1 text-[11px] text-muted-foreground hover:text-destructive md:ml-auto md:h-7 md:min-h-0 md:shrink-0 md:px-2 md:text-xs"
                  aria-label="Stop showing"
                >
                  {busy === "dismiss" || busy === "silence" ? (
                    <Loader2 className="h-3 w-3 animate-spin md:mr-1" />
                  ) : (
                    <VolumeX className="h-3 w-3 md:mr-1" />
                  )}
                  <span className="md:hidden">Hide</span>
                  <span className="hidden md:inline">Stop showing</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => {
                    setSilenceOpen(false);
                    setSilenceReason("");
                    setNoteOpen(true);
                  }}
                >
                  Just this assist, for good
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  Quiet every {sourceLabel} assist for…
                </DropdownMenuLabel>
                {QUIET_WINDOWS.filter((w) => w.kind !== "forever").map(
                  (window) => (
                    <DropdownMenuItem
                      key={window.key}
                      className="text-xs"
                      onSelect={() =>
                        void quietKindFor(window.key, window.label)
                      }
                    >
                      {window.label}
                    </DropdownMenuItem>
                  ),
                )}
                <DropdownMenuItem
                  className="text-xs"
                  onSelect={() => {
                    setNoteOpen(false);
                    setNote("");
                    setSilenceOpen(true);
                  }}
                >
                  Until I turn it back on…
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
                onClick={() => void silenceForever()}
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
