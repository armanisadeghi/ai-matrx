// features/kg-suggestions/components/KgNewSuggestionNotifier.tsx
//
// The app-global "Hey, we found something new you might like" nudge. Mounted
// once near the root (DeferredSingletons) so it fires no matter what route the
// user is on — they could be checking messages while an overnight Knowledge/NER batch
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
import { toast } from "@/lib/toast";
import { presentOrganizationRefusal } from "@ai-matrx/chat/host/org";
import { Lightbulb, X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUser } from "@/lib/redux/selectors/userSelectors";
import { useKgSuggestions } from "@/features/kg-suggestions/hooks/useKgSuggestions";
import { useOpenKgSuggestions } from "@/features/kg-suggestions/canvas/kgSuggestionsKind";
import {
  ackSuggestions,
  fetchAckedSuggestionIds,
} from "@/features/kg-suggestions/service/kgSuggestionAckService";
import { isLowConfidence } from "@/features/kg-suggestions/constants";
import { useLateIdleReady } from "@/lib/boot/lateIdle";

const TOAST_ID = "kg-new-suggestion";
// Let the user land and orient before interrupting. Nothing is READ before this either: the
// suggestion list and the ack set are fetched when the delay (counted from the page's idle flush)
// ends, and the toast shows as soon as they arrive — never a startup read for a toast 9 s away.
const SHOW_DELAY_MS = 9000;

export default function KgNewSuggestionNotifier() {
  const user = useAppSelector(selectUser);
  const userId = user?.id ?? null;
  const due = useLateIdleReady(SHOW_DELAY_MS);
  const { items } = useKgSuggestions({ global: true, status: "pending" }, { autoFetch: due });
  const openInbox = useOpenKgSuggestions();

  // Durable "don't show again" set (loaded once per user). State (not ref) so
  // its arrival re-runs the show effect even if `items` already resolved.
  const [acked, setAcked] = useState<Set<string> | null>(null);
  // Session guards — no re-render needed.
  const shownRef = useRef(false);

  useEffect(() => {
    if (!userId || !due) return undefined;
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
  }, [userId, due]);

  useEffect(() => {
    if (!userId || acked == null || shownRef.current) return undefined;
    // Never interrupt the user for low-quality (<50%) proposals — they're mostly
    // noise and live quietly in the manager's low-quality section instead.
    const unseen = items.filter(
      (i) => !acked.has(i.id) && !isLowConfidence(i),
    );
    if (unseen.length === 0) return undefined;
    const unseenIds = unseen.map((i) => i.id);
    const count = unseen.length;

    // The delay was already spent before the reads started (`due`); show on the next tick.
    const timer = setTimeout(() => {
      shownRef.current = true;
      toast.custom(
        (id) => (
          <NewSuggestionToast
            // read-gate-exempt: the toast fires only when unseen suggestions exist, so a failed read never announces 0
            count={count}
            onReview={() => {
              toast.dismiss(id);
              openInbox();
            }}
            onClose={() => toast.dismiss(id)}
            onDontShow={() => {
              toast.dismiss(id);
              setAcked((prev) => {
                const next = new Set(prev ?? []);
                for (const sid of unseenIds) next.add(sid);
                return next;
              });
              void ackSuggestions(userId, unseenIds).catch((error: unknown) => {
                // Best-effort: a failed durable ack just means it may resurface
                // on a later session — never block the dismissal on the write.
                // Except the one refusal the person can fix: the dismissal is
                // filed in an organization, and with none selected it was not
                // kept, so "don't show again" would silently not hold.
                presentOrganizationRefusal(error, { subject: "Your \"don't show again\"", act: "saved" });
              });
            }}
          />
        ),
        { id: TOAST_ID, duration: Infinity },
      );
    }, 0);

    return () => clearTimeout(timer);
  }, [userId, acked, items, openInbox]);

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
