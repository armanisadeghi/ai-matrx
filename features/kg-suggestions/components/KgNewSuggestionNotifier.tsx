// features/kg-suggestions/components/KgNewSuggestionNotifier.tsx
//
// The app-global "Hey, we found something new you might like" nudge. Mounted
// once near the root (DeferredSingletons) so it fires no matter what route the
// user is on — they could be checking messages while an overnight RAG/NER batch
// quietly produced suggestions for their org/scopes.
//
// Two dismissal tiers, by design:
//   - Close (X / "Not now") → transient. We don't nag again this session, but a
//     full reload may surface it again. Nothing is persisted.
//   - "Don't show again"    → durable. Writes an ack row per CURRENT suggestion
//     id (kg_suggestion_ack). Those ids never re-trigger the toast, but a
//     brand-new suggestion id (never acknowledged) still pops later.
//
// This is deliberately different from the inline hints (chips/dots/banners),
// which are only silenced for one load and return on refresh — those live where
// the user is already working; THIS one interrupts, so it must be respectful.

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Lightbulb, X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { useOpenKgSuggestionsDrawer } from "@/features/overlays/openers/kgSuggestionsDrawer";
import {
  ackSuggestions,
  fetchAckedSuggestionIds,
} from "@/features/kg-suggestions/service/kgSuggestionAckService";
import { isLowConfidence } from "@/features/kg-suggestions/constants";

const TOAST_ID = "kg-new-suggestion";
// Let the user land and orient before interrupting.
const SHOW_DELAY_MS = 9000;

export default function KgNewSuggestionNotifier() {
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? null;
  const { items } = useKgSuggestions({ global: true, status: "pending" });
  const openDrawer = useOpenKgSuggestionsDrawer();

  // Durable "don't show again" set (loaded once per user). State (not ref) so
  // its arrival re-runs the show effect even if `items` already resolved.
  const [acked, setAcked] = useState<Set<string> | null>(null);
  // Session guards — no re-render needed.
  const shownRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchAckedSuggestionIds(userId)
      .then((set) => {
        if (!cancelled) setAcked(set);
      })
      .catch(() => {
        if (!cancelled) setAcked(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || acked == null || shownRef.current) return;
    // Never interrupt the user for low-quality (<50%) proposals — they're mostly
    // noise and live quietly in the manager's low-quality section instead.
    const unseen = items.filter(
      (i) => !acked.has(i.id) && !isLowConfidence(i),
    );
    if (unseen.length === 0) return;
    const unseenIds = unseen.map((i) => i.id);
    const count = unseen.length;

    const timer = setTimeout(() => {
      shownRef.current = true;
      toast.custom(
        (id) => (
          <NewSuggestionToast
            count={count}
            onReview={() => {
              toast.dismiss(id);
              openDrawer();
            }}
            onClose={() => toast.dismiss(id)}
            onDontShow={() => {
              toast.dismiss(id);
              setAcked((prev) => {
                const next = new Set(prev ?? []);
                for (const sid of unseenIds) next.add(sid);
                return next;
              });
              void ackSuggestions(userId, unseenIds).catch(() => {
                // Best-effort: a failed durable ack just means it may resurface
                // on a later session — never block the dismissal on the write.
              });
            }}
          />
        ),
        { id: TOAST_ID, duration: Infinity },
      );
    }, SHOW_DELAY_MS);

    return () => clearTimeout(timer);
  }, [userId, acked, items, openDrawer]);

  return null;
}

function NewSuggestionToast({
  count,
  onReview,
  onClose,
  onDontShow,
}: {
  count: number;
  onReview: () => void;
  onClose: () => void;
  onDontShow: () => void;
}) {
  const noun = count === 1 ? "suggestion" : "suggestions";
  return (
    <div className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-amber-500/40 bg-card shadow-lg overflow-hidden">
      <div className="flex items-start gap-3 p-3.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
          <Lightbulb className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {count} new {noun} you might like
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            We analyzed your recent content and proposed filling some scope
            fields. Want to take a look?
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={onReview}
              className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Review
            </button>
            <button
              type="button"
              onClick={onDontShow}
              className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Don&apos;t show again
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 -mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
