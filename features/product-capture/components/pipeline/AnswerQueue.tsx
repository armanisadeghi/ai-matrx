"use client";

/**
 * AnswerQueue — the focused mobile Q&A surface: one question at a time,
 * image-first (the item's featured photo makes identification instant),
 * core info + a link to the full item, then the fastest possible answer:
 * choice chips / Yes-No / text with a voice option (recorded, transcribed,
 * dropped into the answer). Skip sends the question to the BACK of the
 * queue; "Not a quick answer" defers it out of this flow entirely
 * (physical-testing questions route elsewhere).
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCw,
  SkipForward,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { transcribeAudioFile } from "@/features/audio/services/speechApi";
import { toAudioFile } from "@/features/audio/utils/audio-mime";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";

import { VoiceNoteButton } from "../VoiceNoteButton";
import {
  answerQuestion,
  deferQuestion,
  listItemsByIds,
  listOpenQuestions,
  skipQuestion,
  type PipelineItem,
  type PipelineQuestion,
} from "../../pipeline-service";
import { listFilesForItems } from "../../service";
import { STAGE_LABELS } from "../../pipeline-types";

interface QueueEntry {
  question: PipelineQuestion;
  item: PipelineItem;
  thumbFileId: string | null;
}

export function AnswerQueue() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [queue, setQueue] = useState<QueueEntry[] | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    try {
      const open = await listOpenQuestions(organizationId);
      const itemIds = [...new Set(open.map((q) => q.itemId))];
      const [itemsById, filesByItem] = await Promise.all([
        listItemsByIds(itemIds),
        listFilesForItems(itemIds),
      ]);
      setQueue(
        open.flatMap((question) => {
          const item = itemsById.get(question.itemId);
          if (!item) return [];
          const photos = (filesByItem.get(item.id) ?? []).filter(
            (f) => f.kind === "photo",
          );
          return [
            {
              question,
              item,
              thumbFileId: item.featuredFileId ?? photos[0]?.fileId ?? null,
            },
          ];
        }),
      );
      setAnsweredCount(0);
    } catch (err) {
      console.error("[product-pipeline] answer queue load failed", err);
      toast.error("Could not load the question queue.");
      setQueue([]);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!organizationId) return;
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [organizationId, load]);

  const current = queue?.[0] ?? null;
  const total = (queue?.length ?? 0) + answeredCount;

  const advance = useCallback(
    (opts: { requeue?: QueueEntry; answered?: boolean }) => {
      setDraft("");
      setQueue((prev) => {
        if (!prev || prev.length === 0) return prev;
        const rest = prev.slice(1);
        return opts.requeue ? [...rest, opts.requeue] : rest;
      });
      if (opts.answered) setAnsweredCount((n) => n + 1);
    },
    [],
  );

  const submitAnswer = useCallback(
    async (value: string) => {
      if (!current || !value.trim()) return;
      setBusy(true);
      try {
        await answerQuestion(current.question, value.trim());
        advance({ answered: true });
      } catch (err) {
        console.error("[product-pipeline] answer failed", err);
        toast.error("Could not save the answer.");
      } finally {
        setBusy(false);
      }
    },
    [current, advance],
  );

  const skip = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      const updated = await skipQuestion(current.question);
      advance({ requeue: { ...current, question: updated } });
    } catch (err) {
      console.error("[product-pipeline] skip failed", err);
      toast.error("Could not skip the question.");
    } finally {
      setBusy(false);
    }
  }, [current, advance]);

  const defer = useCallback(async () => {
    if (!current) return;
    setBusy(true);
    try {
      await deferQuestion(current.question, "Not a quick answer");
      advance({});
      toast.info("Routed out of the quick-answer flow.");
    } catch (err) {
      console.error("[product-pipeline] defer failed", err);
      toast.error("Could not defer the question.");
    } finally {
      setBusy(false);
    }
  }, [current, advance]);

  const onVoiceAnswer = useCallback(
    (blob: Blob) => {
      setTranscribing(true);
      void (async () => {
        try {
          const file = toAudioFile(blob, { prefix: `answer-${Date.now()}` });
          const result = await transcribeAudioFile(file);
          const text = result.text.trim();
          if (!text) {
            toast.info("No speech detected — try again.");
            return;
          }
          setDraft((prev) => (prev ? `${prev} ${text}` : text));
        } catch (err) {
          console.error("[product-pipeline] voice answer failed", err);
          toast.error("Could not transcribe the recording.");
        } finally {
          setTranscribing(false);
        }
      })();
    },
    [],
  );

  if (queue === null) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!current) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <CheckCircle2 className="h-10 w-10 text-primary" />
        <p className="text-base font-medium">
          {answeredCount > 0
            ? `All done — ${answeredCount} answered.`
            : "No open questions right now."}
        </p>
        <p className="text-sm text-muted-foreground">
          The agents keep working with what you gave them.
        </p>
        <Button variant="outline" className="h-10" onClick={() => void load()}>
          <RotateCw className="mr-1.5 h-4 w-4" />
          Check again
        </Button>
      </div>
    );
  }

  const { question, item, thumbFileId } = current;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 pb-safe">
      <p className="text-center text-xs text-muted-foreground">
        Question {answeredCount + 1} of {total}
      </p>

      {/* The item, image-first */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Link
          href={`/tools/product-capture/item/${item.id}`}
          className="block"
          aria-label="Open the full item"
        >
          <div className="aspect-[4/3] w-full bg-muted">
            {thumbFileId ? (
              <CaptureThumb
                fileId={thumbFileId}
                alt={item.code ?? "Item photo"}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Camera className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
        </Link>
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {item.code ?? "No product number"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {STAGE_LABELS[item.stage]}
              {item.notes ? ` · ${item.notes}` : ""}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-9 shrink-0">
            <Link href={`/tools/product-capture/manage?item=${item.id}`}>
              <ExternalLink className="mr-1 h-3.5 w-3.5" />
              Full listing
            </Link>
          </Button>
        </div>
      </div>

      {/* The question */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-base font-medium">{question.prompt}</p>
        {question.context && (
          <p className="mt-1 text-sm text-muted-foreground">
            {question.context}
          </p>
        )}

        <div className="mt-3 space-y-2.5">
          {question.kind === "choice" && question.options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {question.options.map((o) => (
                <Button
                  key={o.value}
                  variant="outline"
                  className="h-11 flex-1 basis-[calc(50%-0.25rem)]"
                  disabled={busy}
                  onClick={() => void submitAnswer(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          )}
          {question.kind === "boolean" && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="h-11 flex-1"
                disabled={busy}
                onClick={() => void submitAnswer("yes")}
              >
                Yes
              </Button>
              <Button
                variant="outline"
                className="h-11 flex-1"
                disabled={busy}
                onClick={() => void submitAnswer("no")}
              >
                No
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                transcribing ? "Transcribing…" : "Type or dictate an answer…"
              }
              enterKeyHint="send"
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitAnswer(draft);
              }}
              className="h-11 min-w-0 flex-1 rounded-full border border-input bg-background px-4 text-base focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <VoiceNoteButton
              onRecordingComplete={onVoiceAnswer}
              disabled={busy}
            />
          </div>

          <Button
            className="h-11 w-full"
            disabled={busy || !draft.trim()}
            onClick={() => void submitAnswer(draft)}
          >
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 h-4 w-4" />
            )}
            Answer &amp; next
          </Button>
        </div>
      </div>

      {/* Queue controls */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="h-11 flex-1"
          disabled={busy}
          onClick={() => void skip()}
        >
          <SkipForward className="mr-1.5 h-4 w-4" />
          Skip for now
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1 text-muted-foreground"
          disabled={busy}
          onClick={() => void defer()}
        >
          <Wrench className="mr-1.5 h-4 w-4" />
          Not a quick answer
        </Button>
      </div>
    </div>
  );
}
