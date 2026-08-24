"use client";

/**
 * SMART LOADER prototype (Arman, 2026-08-24): a loading component that READS
 * the streaming partial value and performs it — here, quiz questions surface
 * one by one in large type as they arrive, with a live count. The user can't
 * take the quiz mid-stream anyway, so this beats rendering a disabled quiz:
 * the loader itself is the show.
 *
 * This is the flagship example of the third rendering posture:
 *   A. progressive — real component from the first renderable unit
 *   B. smart loader — a data-fed animation until complete   ← this file
 *   C. skeleton until done — for trivial/tiny payloads only
 */

import { useEffect, useRef, useState } from "react";
import { BrainCircuit, CircleCheck } from "lucide-react";

interface PartialQuizQuestion {
  question?: string;
  options?: string[];
}

interface PartialQuizValue {
  title?: string;
  description?: string;
  questions?: PartialQuizQuestion[];
}

/** A question counts once its text has meaningfully arrived. */
function readyQuestions(value: PartialQuizValue): PartialQuizQuestion[] {
  return (value.questions ?? []).filter(
    (q) => typeof q?.question === "string" && q.question.trim().length > 8,
  );
}

export default function SmartQuizLoader({ value }: { value: PartialQuizValue }) {
  const ready = readyQuestions(value);
  const count = ready.length;
  // Show the newest fully-arrived question; animate on index change.
  const showIndex = Math.max(0, count - 1);
  const current = ready[showIndex];
  const lastIndexRef = useRef(-1);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    if (showIndex === lastIndexRef.current) return undefined;
    lastIndexRef.current = showIndex;
    setEntering(true);
    const t = setTimeout(() => setEntering(false), 450);
    return () => clearTimeout(t);
  }, [showIndex]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-gradient-to-br from-primary/5 via-card to-card p-6">
      {/* header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 animate-pulse text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {value.title || "Building your quiz"}
            </p>
            <p className="text-xs text-muted-foreground">
              {count === 0
                ? "Writing the first question…"
                : `${count} question${count === 1 ? "" : "s"} ready — more on the way`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {ready.map((_, i) => (
            <CircleCheck
              key={i}
              className="h-3.5 w-3.5 text-primary/80 transition-transform duration-300"
            />
          ))}
        </div>
      </div>

      {/* the performing part: the newest question, large */}
      <div className="min-h-24">
        {current ? (
          <div
            key={showIndex}
            className={`transition-all duration-500 ${
              entering ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Question {showIndex + 1}
            </p>
            <p className="mt-1 text-xl font-semibold leading-snug text-foreground">
              {current.question}
            </p>
            {(current.options ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(current.options ?? []).map((option, i) => (
                  <span
                    key={i}
                    className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {option}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        )}
      </div>

      {/* shimmer footer */}
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[ksl-shimmer_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
      </div>
      <style>{`@keyframes ksl-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(400%); } }`}</style>
    </div>
  );
}
