"use client";

/**
 * IntakeAnswerQueue — the mobile-first answer queue over
 * `commerce.asset_unknown` (the prototype's sharpest piece,
 * PROTOTYPE-CONCEPTS §4, rebuilt onto the C1 tables).
 *
 * - Loads ALL open questions across the org, ordered
 *   `skip_count ASC, priority DESC, created_at ASC` — skipped questions
 *   genuinely sink.
 * - Image-first cards: the asset's featured/first photo IS the question
 *   context.
 * - Fastest input per kind: choice → two-up chips (one tap answers AND
 *   advances), boolean → two full-width buttons, always a text field with a
 *   mic whose dictation fills the DRAFT for editing, never auto-submits.
 * - Three exits: Answer · Skip for now (skip_count++, back of queue) ·
 *   Not a quick answer (deferred_at + reason — leaves this flow entirely).
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  RotateCw,
  SkipForward,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { transcribeAudioFile } from "@/features/audio/services/speechApi";
import { toAudioFile } from "@/features/audio/utils/audio-mime";
import { VoiceNoteButton } from "@/features/product-capture/components/VoiceNoteButton";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";

import type { AssetQuestion, IntakeAsset } from "../types";
import {
  answerQuestion,
  deferQuestion,
  listArtifactsForAssets,
  listAssetsByIds,
  listOpenQuestions,
  listPrimaryQrForAssets,
  skipQuestion,
} from "../service";

interface QueueEntry {
  question: AssetQuestion;
  asset: IntakeAsset;
  qrCode: string | null;
  thumbFileId: string | null;
}

export function IntakeAnswerQueue() {
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
      const assetIds = [...new Set(open.map((q) => q.assetId))];
      const [assetsById, artifactsByAsset, qrByAsset] = await Promise.all([
        listAssetsByIds(assetIds),
        listArtifactsForAssets(assetIds),
        listPrimaryQrForAssets(assetIds),
      ]);
      setQueue(
        open.flatMap((question) => {
          const asset = assetsById.get(question.assetId);
          if (!asset) return [];
          const artifacts = artifactsByAsset.get(asset.id) ?? [];
          const featured = asset.featuredArtifactId
            ? artifacts.find((a) => a.id === asset.featuredArtifactId)
            : undefined;
          const firstPhoto = artifacts.find(
            (a) => a.kind === "photo" && !a.isDelineator && a.fileId,
          );
          return [
            {
              question,
              asset,
              qrCode: qrByAsset.get(asset.id) ?? null,
              thumbFileId: featured?.fileId ?? firstPhoto?.fileId ?? null,
            },
          ];
        }),
      );
      setAnsweredCount(0);
    } catch (err) {
      console.error("[commerce-intake] answer queue load failed", err);
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
        console.error("[commerce-intake] answer failed", err);
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
      console.error("[commerce-intake] skip failed", err);
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
      console.error("[commerce-intake] defer failed", err);
      toast.error("Could not defer the question.");
    } finally {
      setBusy(false);
    }
  }, [current, advance]);

  const onVoiceAnswer = useCallback((blob: Blob) => {
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
        // Dictation fills the DRAFT for editing — never auto-submits (§4).
        setDraft((prev) => (prev ? `${prev} ${text}` : text));
      } catch (err) {
        console.error("[commerce-intake] voice answer failed", err);
        toast.error("Could not transcribe the recording.");
      } finally {
        setTranscribing(false);
      }
    })();
  }, []);

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

  const { question, asset, qrCode, thumbFileId } = current;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-3 pb-safe">
      <p className="text-center text-xs text-muted-foreground">
        Question {answeredCount + 1} of {total}
      </p>

      {/* The asset, image-first */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Link
          href={`/commerce/intake/assets/${asset.id}`}
          className="block"
          aria-label="Open the full item"
        >
          <div className="aspect-[4/3] w-full bg-muted">
            {thumbFileId ? (
              <CaptureThumb fileId={thumbFileId} alt={qrCode ?? "Item photo"} />
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
              {qrCode ?? "No code"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {asset.pipelineState.replace(/_/g, " ")}
              {asset.notes ? ` · ${asset.notes}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* The question */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-base font-medium">{question.prompt}</p>

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
