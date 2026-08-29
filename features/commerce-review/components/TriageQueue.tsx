"use client";

/**
 * TriageQueue — gate 1, warehouse triage (/commerce/triage). Fast,
 * image-first, keyboard-driven: one asset at a time, big photo, the AI's
 * bucket call + confidence + reasoning, and five bucket keys. Built for the
 * warehouse pace, not the desk pace — every decision is one keystroke.
 *
 * Keyboard: 1–5 = bucket (in VALUE_BUCKETS order) · Enter = confirm the
 * AI's own bucket · J/K or arrows = next/prev · N = focus notes-free skip.
 * Decisions write through decideValueBucket (correction row + status write —
 * never an edit of the AI's result row).
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Gem,
  Inbox,
  Loader2,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CaptureThumb } from "@/features/media-capture/components/CaptureThumb";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { toast } from "@/lib/toast";

import type { TriageItem, ValueBucket } from "../types";
import { VALUE_BUCKETS } from "../types";
import { decideValueBucket, listTriageQueue } from "../service";
import { ConfidenceChip } from "./ConfidenceChip";

const BUCKET_LABELS: Record<ValueBucket, string> = {
  definite_value: "Definite value",
  conditional_value: "Conditional",
  possible_value: "Possible",
  no_value: "No value",
  unknown: "Unknown",
};

export function TriageQueue() {
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [items, setItems] = useState<TriageItem[] | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    listTriageQueue(organizationId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Could not load the queue."),
      );
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const item = items?.[index] ?? null;

  const decide = async (bucket: ValueBucket) => {
    if (!item || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await decideValueBucket(item, bucket);
      setItems((prev) => (prev ?? []).filter((i) => i.assetId !== item.assetId));
      setIndex((i) => Math.max(0, Math.min(i, (items?.length ?? 1) - 2)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save the decision.");
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
      const current = items?.[index];
      if (!current) return;
      const n = Number(e.key);
      if (n >= 1 && n <= VALUE_BUCKETS.length) {
        e.preventDefault();
        void decide(VALUE_BUCKETS[n - 1]);
      } else if (e.key === "Enter" && current.aiBucket) {
        e.preventDefault();
        void decide(current.aiBucket as ValueBucket);
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
        <p className="text-sm">Nothing awaiting triage.</p>
      </div>
    );
  if (!item) return null;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-3 p-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {index + 1} of {items.length} awaiting triage
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous item"
            disabled={index === 0}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next item"
            disabled={index >= items.length - 1}
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap gap-2">
          {item.photoFileIds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos captured.</p>
          ) : (
            item.photoFileIds.map((fileId, i) => (
              <div
                key={fileId}
                className={i === 0 ? "h-64 w-64" : "h-20 w-20"}
              >
                <CaptureThumb fileId={fileId} alt={`Item photo ${i + 1}`} />
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.isGemCandidate && (
            <Badge className="gap-1" variant="secondary">
              <Gem className="h-3 w-3" /> Gem candidate
            </Badge>
          )}
          {item.estimatedValue !== null && (
            <Badge variant="outline">
              est. {item.estimatedValue} {item.estimatedValueCurrency ?? ""}
            </Badge>
          )}
          {item.aiBucket && (
            <Badge variant="outline">
              AI: {BUCKET_LABELS[item.aiBucket as ValueBucket] ?? item.aiBucket}
            </Badge>
          )}
          <ConfidenceChip confidence={item.aiConfidence} />
        </div>
        {item.aiReasoning && (
          <p className="mt-2 text-sm text-muted-foreground">{item.aiReasoning}</p>
        )}
        {item.notes && (
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
            {item.notes}
          </p>
        )}
        <Link
          href={`/commerce/intake/assets/${item.assetId}`}
          className="mt-2 inline-block text-xs text-muted-foreground underline hover:text-foreground"
        >
          Open full asset
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {VALUE_BUCKETS.map((bucket, i) => (
          <Button
            key={bucket}
            variant={item.aiBucket === bucket ? "default" : "outline"}
            disabled={busy}
            className="h-12 flex-col gap-0.5"
            onClick={() => void decide(bucket)}
          >
            <span className="flex items-center gap-1 text-sm">
              {item.aiBucket === bucket && <Check className="h-3.5 w-3.5" />}
              {BUCKET_LABELS[bucket]}
            </span>
            <span className="text-[10px] opacity-70">key {i + 1}</span>
          </Button>
        ))}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">
        1–5 decide · Enter confirms the AI&apos;s call · J/K move
      </p>
    </div>
  );
}
