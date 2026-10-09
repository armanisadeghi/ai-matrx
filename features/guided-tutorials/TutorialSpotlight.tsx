"use client";

/**
 * The guided-tutorial spotlight — dims the page, cuts out the current step's
 * target with an animated ring, and parks a compact step card beside it.
 *
 * NON-BLOCKING by construction (no-dead-ends: AI stays reachable). Every layer
 * here is `pointer-events: none` except the step card itself, so the person can
 * press the highlighted control — which is how an action step advances — and
 * anything else on the page stays usable.
 *
 * Honest when the page drifts: a step whose `data-tour` target is not on the
 * page after a short wait says so in its card instead of pointing at nothing.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  MousePointerClick,
  PartyPopper,
  X,
} from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import type { GuidedTutorial } from "./registry";

const HOLE_PAD = 8;
const CARD_W = 296;
const CARD_GAP = 14;
const FIND_TIMEOUT_MS = 4000;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function findTarget(target: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(target)}"]`);
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** Where the card goes: below the hole, else above, else the side with room. */
function placeCard(hole: Rect | null, cardH: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampX = (x: number) => Math.min(Math.max(12, x), vw - CARD_W - 12);
  const clampY = (y: number) => Math.min(Math.max(12, y), vh - cardH - 12);
  if (!hole) return { top: clampY(vh / 2 - cardH / 2), left: clampX(vw / 2 - CARD_W / 2) };
  const below = hole.top + hole.height + CARD_GAP;
  if (below + cardH <= vh - 12) return { top: below, left: clampX(hole.left) };
  const above = hole.top - CARD_GAP - cardH;
  if (above >= 12) return { top: above, left: clampX(hole.left) };
  const right = hole.left + hole.width + CARD_GAP;
  if (right + CARD_W <= vw - 12) return { top: clampY(hole.top), left: right };
  return { top: clampY(hole.top), left: clampX(hole.left - CARD_GAP - CARD_W) };
}

const CONFETTI_COLORS = [
  "bg-primary",
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-4",
  "bg-chart-5",
  "bg-success",
];

function Confetti() {
  // Fixed spread, no randomness at render: 28 pieces on a ring, each its own drift.
  const pieces = Array.from({ length: 28 }, (_, i) => {
    const angle = (i / 28) * Math.PI * 2;
    const dist = 90 + ((i * 37) % 70);
    return {
      i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 30,
      rot: (i * 53) % 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: (i % 5) * 18,
    };
  });
  return (
    <div className="pointer-events-none absolute left-1/2 top-6" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.i}
          className={cn("mx-tut-confetti absolute h-2 w-1.5 rounded-[1px]", p.color)}
          style={
            {
              "--dx": `${p.dx}px`,
              "--dy": `${p.dy}px`,
              "--rot": `${p.rot}deg`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export interface TutorialSpotlightProps {
  tutorial: GuidedTutorial;
  /** `completed` is true only when the person reached the end. */
  onClose: (completed: boolean) => void;
}

export function TutorialSpotlight({ tutorial, onClose }: TutorialSpotlightProps) {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [hole, setHole] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const [cardH, setCardH] = useState(150);
  const [advancing, setAdvancing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<Rect | null>(null);
  // The card only glides once it has been placed at a real target; the first
  // placement is instant (no centre-to-target slide).
  const everPlacedRef = useRef(false);
  const [settled, setSettled] = useState(false);

  const step = tutorial.steps[index];
  const isLast = index === tutorial.steps.length - 1;

  const next = () => {
    setAdvancing(false);
    if (isLast) setFinished(true);
    else setIndex((i) => i + 1);
  };
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Find the target (it may render late), bring it into view, then follow it.
  useEffect(() => {
    if (finished || !step) return;
    let raf = 0;
    let el: HTMLElement | null = null;
    const started = performance.now();
    setMissing(false);
    // Keep the previous hole on screen until the new target is measured; only
    // the ref resets, so the new target still gets scrolled into view.
    holeRef.current = null;

    const measure = () => {
      if (!el || !el.isConnected) el = findTarget(step.target);
      if (!el) {
        if (performance.now() - started > FIND_TIMEOUT_MS) {
          setMissing(true);
          return;
        }
        raf = requestAnimationFrame(measure);
        return;
      }
      if (!holeRef.current) {
        el.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      }
      const r = el.getBoundingClientRect();
      const nextRect: Rect = {
        top: r.top - HOLE_PAD,
        left: r.left - HOLE_PAD,
        width: r.width + HOLE_PAD * 2,
        height: r.height + HOLE_PAD * 2,
      };
      if (!sameRect(holeRef.current, nextRect)) {
        holeRef.current = nextRect;
        setHole(nextRect);
        if (!everPlacedRef.current) {
          everPlacedRef.current = true;
          raf = requestAnimationFrame(() => setSettled(true));
        }
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [step, finished, reduced]);

  // An action step advances when the person does the thing inside the target.
  useEffect(() => {
    if (finished || !step?.action) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const lastIndex = tutorial.steps.length - 1;
    const advance = () => {
      setAdvancing(false);
      if (index >= lastIndex) setFinished(true);
      else setIndex(index + 1);
    };
    const onPress = (event: Event) => {
      const el = findTarget(step.target);
      const hit = event.target instanceof Node ? event.target : null;
      if (!el || !hit || !el.contains(hit)) return;
      if (step.action === "copy" && event.type === "click") {
        const control = hit instanceof Element ? hit.closest("button, [role='button']") : null;
        if (!control) return;
      }
      setAdvancing(true);
      // Let the press land visibly (a tab switching, a copy tick) before moving on.
      timer = setTimeout(advance, reduced ? 150 : 650);
    };
    document.addEventListener("click", onPress, true);
    if (step.action === "copy") document.addEventListener("copy", onPress, true);
    return () => {
      document.removeEventListener("click", onPress, true);
      document.removeEventListener("copy", onPress, true);
      if (timer) clearTimeout(timer);
    };
  }, [step, finished, reduced, index, tutorial.steps.length]);

  // Keyboard: Escape skips, arrows move.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(finished);
      else if (!finished && event.key === "ArrowRight" && event.altKey) next();
      else if (!finished && event.key === "ArrowLeft" && event.altKey) back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  });

  const showHole = !finished && hole !== null && !missing;
  const cardPos = placeCard(showHole ? hole : null, cardH);
  const motion = reduced || !settled ? "" : "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";
  const ActionIcon = step?.action === "copy" ? Copy : MousePointerClick;

  return createPortal(
    <div className="mx-tut-root pointer-events-none fixed inset-0 z-[9990]" data-reduced-motion={reduced || undefined}>
      <style>{TUTORIAL_CSS}</style>
      {showHole ? (
        <>
          {/* The cutout: a transparent box whose giant shadow is the dim layer. */}
          <div
            className={cn("absolute rounded-xl", motion)}
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow: "0 0 0 200vmax rgb(0 0 0 / 0.55)",
            }}
          />
          <div
            className={cn("absolute rounded-xl ring-2 ring-primary", motion, advancing && "mx-tut-done-ring")}
            style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
          />
          {!reduced && !advancing ? (
            <div
              key={index}
              className="mx-tut-pulse absolute rounded-xl ring-2 ring-primary"
              style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
            />
          ) : null}
        </>
      ) : (
        <div className={cn("absolute inset-0 bg-black/55", !reduced && "mx-tut-fade")} />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={tutorial.title}
        className={cn(
          "pointer-events-auto absolute rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl",
          motion,
          finished && !reduced && "mx-tut-glow",
          finished && reduced && "ring-2 ring-primary",
        )}
        style={{ top: cardPos.top, left: cardPos.left, width: CARD_W }}
      >
        {finished ? (
          <div className="relative flex flex-col items-center gap-2 py-2 text-center">
            {!reduced ? <Confetti /> : null}
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <PartyPopper className="h-5 w-5" aria-hidden />
            </span>
            <p className="m-0 type-title">You're all set</p>
            <p className="m-0 type-secondary text-muted-foreground">{tutorial.title} — done</p>
            <Button variant="primary" autoFocus className="mt-1" icon={<Check />} onClick={() => onClose(true)}>
              Done
            </Button>
          </div>
        ) : step ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="m-0 type-meta font-medium text-muted-foreground">
                  {tutorial.title} · {index + 1} of {tutorial.steps.length}
                </p>
                <p className="m-0 type-title">{step.title}</p>
              </div>
              <Button
                variant="quiet"
                aria-label="Skip tutorial"
                title="Skip"
                className="-mr-1 -mt-1 shrink-0"
                icon={<X />}
                onClick={() => onClose(false)}
              />
            </div>
            <p className="m-0 type-secondary text-muted-foreground">
              {missing ? "This part isn't on the page right now" : step.text}
            </p>
            {step.action && !missing ? (
              <p className="m-0 inline-flex items-center gap-1.5 type-meta font-medium text-primary">
                {advancing ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ActionIcon className="h-3.5 w-3.5" aria-hidden />}
                {advancing ? "Nice" : step.action === "copy" ? "Copy it to continue" : "Click it to continue"}
              </p>
            ) : null}
            <div className="mt-1 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1" aria-hidden>
                {tutorial.steps.map((s, i) => (
                  <span
                    key={s.target}
                    className={cn(
                      "h-1.5 rounded-full",
                      !reduced && "transition-all duration-300",
                      i === index ? "w-4 bg-primary" : i < index ? "w-1.5 bg-primary/60" : "w-1.5 bg-muted-foreground/30",
                    )}
                  />
                ))}
              </div>
              {index > 0 ? (
                <Button variant="quiet" icon={<ArrowLeft />} onClick={back}>
                  Back
                </Button>
              ) : null}
              <Button variant="primary" iconEnd={isLast ? <Check /> : <ArrowRight />} onClick={next}>
                {isLast ? "Finish" : "Next"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

const TUTORIAL_CSS = `
@keyframes mx-tut-pulse { 0% { opacity: .9; transform: scale(1); } 70% { opacity: 0; transform: scale(1.06); } 100% { opacity: 0; transform: scale(1.06); } }
.mx-tut-pulse { animation: mx-tut-pulse 1.8s cubic-bezier(.22,1,.36,1) infinite; }
@keyframes mx-tut-fade { from { opacity: 0; } to { opacity: 1; } }
.mx-tut-fade { animation: mx-tut-fade .3s ease-out both; }
@keyframes mx-tut-done-ring { 0% { box-shadow: 0 0 0 0 hsl(var(--primary) / .55); } 100% { box-shadow: 0 0 0 14px hsl(var(--primary) / 0); } }
.mx-tut-done-ring { animation: mx-tut-done-ring .6s ease-out both; }
@keyframes mx-tut-glow { 0% { box-shadow: 0 0 0 0 hsl(var(--primary) / .5); } 100% { box-shadow: 0 0 0 18px hsl(var(--primary) / 0), 0 20px 40px -12px hsl(var(--primary) / .35); } }
.mx-tut-glow { animation: mx-tut-glow 1.1s ease-out both; }
@keyframes mx-tut-confetti { 0% { opacity: 1; transform: translate(0,0) rotate(0); } 100% { opacity: 0; transform: translate(var(--dx), calc(var(--dy) + 60px)) rotate(var(--rot)); } }
.mx-tut-confetti { animation: mx-tut-confetti 1.1s cubic-bezier(.15,.7,.35,1) both; }
@media (prefers-reduced-motion: reduce) { .mx-tut-root * { animation: none !important; transition: none !important; } }
`;
