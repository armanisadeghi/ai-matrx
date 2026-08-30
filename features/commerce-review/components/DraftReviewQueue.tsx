"use client";

/**
 * DraftReviewQueue — gate 2, lister craft (/commerce/drafts). One draft per
 * screen at the ~15s/item bar: photos, the AI's listing fields
 * confidence-gated (a low-confidence draft opens expanded and demands
 * attention; a high-confidence one collapses to a scan), edit-in-place, and
 * the evidence affordance (the draft's reasoning + source photos beside
 * every field set).
 *
 * Keyboard (outside inputs): Enter/A approve · E edit first field ·
 * R revise · X reject · J/K or arrows next/prev.
 *
 * Every edited field lands as a human_correction diff (before = the AI's
 * value) — the AI's draft row is never touched (the learning-tap law).
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";

import type { DraftItem, ReviewVerdict } from "../types";
import { listDraftQueue, reviewDraft } from "../service";
import { ConfidenceChip, confidenceBand } from "./ConfidenceChip";
import { ProTextarea } from "@/components/official/ProTextarea";

export function DraftReviewQueue() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [items, setItems] = useState<DraftItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    // Fresh load (org change / retry): drop stale rows and any prior error.
    setItems(null);
    setLoadError(null);
    listDraftQueue(organizationId)
      .then((rows) => {
        if (!cancelled) {
          setItems(rows);
          setLoadError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setLoadError(
            e instanceof Error ? e.message : "Could not load the drafts.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadKey]);

  const retryLoad = () => {
    setItems(null);
    setLoadError(null);
    setReloadKey((k) => k + 1);
  };

  const item = items?.[index] ?? null;

  // Edits reset per item — an unsent edit never leaks to the next draft.
  useEffect(() => {
    setEdits({});
  }, [item?.assetId]);

  const submit = async (verdict: ReviewVerdict) => {
    if (!item || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await reviewDraft(item, verdict, edits);
      setItems((prev) => (prev ?? []).filter((i) => i.assetId !== item.assetId));
      setIndex((i) => Math.max(0, Math.min(i, (items?.length ?? 1) - 2)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the review.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!items?.[index]) return;
      if (e.key === "Enter" || e.key === "a") {
        e.preventDefault();
        void submit("approve");
      } else if (e.key === "x") {
        e.preventDefault();
        void submit("reject");
      } else if (e.key === "r") {
        e.preventDefault();
        void submit("revise");
      } else if (e.key === "e") {
        e.preventDefault();
        firstFieldRef.current?.focus();
      } else if (e.key === "j" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        setIndex((i) => Math.min(i + 1, (items?.length ?? 1) - 1));
      } else if (e.key === "k" || e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!organizationId)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Pick an organization first.
      </p>
    );
  if (loadError)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="px-6 text-center text-sm text-destructive">{loadError}</p>
        <Button variant="outline" size="sm" onClick={retryLoad}>
          Try again
        </Button>
      </div>
    );
  if (!items)
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  if (items.length === 0)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Inbox className="h-8 w-8" />
        <p className="text-sm">No drafts awaiting review.</p>
      </div>
    );
  if (!item) return null;

  const band = confidenceBand(item.confidence);

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col gap-3 p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {index + 1} of {items.length} drafts in review
        </span>
        <div className="flex items-center gap-2">
          <ConfidenceChip confidence={item.confidence} />
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous draft"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next draft"
            disabled={index >= items.length - 1}
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
        {/* Evidence side: the photos the draft was read from + its reasoning. */}
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex flex-wrap gap-2">
            {item.photoFileIds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photos.</p>
            ) : (
              item.photoFileIds.map((fileId, i) => (
                <div key={fileId} className={i === 0 ? "h-52 w-full" : "h-20 w-20"}>
                  <CaptureThumb fileId={fileId} alt={`Source photo ${i + 1}`} />
                </div>
              ))
            )}
          </div>
          {item.reasoning && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Why the AI wrote this
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {item.reasoning}
              </p>
            </div>
          )}
          <Link
            href={`/commerce/intake/assets/${item.assetId}`}
            className="mt-2 inline-block text-xs text-muted-foreground underline hover:text-foreground"
          >
            Open full asset
          </Link>
        </div>

        {/* Draft side: confidence-gated fields, edit-in-place. */}
        <div className="rounded-lg border border-border bg-card p-3">
          {band === "low" && (
            <p className="mb-2 text-xs font-medium text-destructive">
              Low-confidence draft — check every field before approving.
            </p>
          )}
          {item.fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The draft has no fields yet — the pipeline may still be writing it.
            </p>
          ) : (
            <div className="space-y-2">
              {item.fields.map((field, i) => {
                const value = edits[field.path] ?? field.value;
                const edited = value !== field.value;
                const shared = {
                  value,
                  onChange: (
                    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                  ) =>
                    setEdits((prev) => ({
                      ...prev,
                      [field.path]: e.target.value,
                    })),
                  "aria-label": field.label,
                };
                return (
                  <div key={field.path}>
                    <div className="mb-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{field.label}</span>
                      {edited && <Pencil className="h-3 w-3" />}
                    </div>
                    {field.multiline ? (
                      <ProTextarea
                        {...shared}
                        rows={band === "high" ? 3 : 6}
                        ref={i === 0 ? (el) => void (firstFieldRef.current = el) : undefined}
                      />
                    ) : (
                      <Input
                        {...shared}
                        ref={i === 0 ? (el) => void (firstFieldRef.current = el) : undefined}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button disabled={busy} className="gap-1" onClick={() => void submit("approve")}>
          <Check className="h-4 w-4" /> Approve <kbd className="text-[10px] opacity-70">Enter</kbd>
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          className="gap-1"
          onClick={() => void submit("revise")}
        >
          <RotateCcw className="h-4 w-4" /> Revise <kbd className="text-[10px] opacity-70">R</kbd>
        </Button>
        <Button
          variant="destructive"
          disabled={busy}
          className="gap-1"
          onClick={() => void submit("reject")}
        >
          <X className="h-4 w-4" /> Reject <kbd className="text-[10px] opacity-70">X</kbd>
        </Button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        Enter approve · E edit · R revise · X reject · J/K move — edits are
        saved as corrections the AI learns from
      </p>
    </div>
  );
}
