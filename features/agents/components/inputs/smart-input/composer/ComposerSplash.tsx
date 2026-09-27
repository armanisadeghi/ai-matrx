"use client";

/**
 * Splash pieces (brief §1, Amendment 1 A4): the greeting above the composer
 * and ONE scrolling row of quick actions below it — never above, never
 * wrapping; a fade on the right edge and a › button that scrolls.
 *
 * The list is DATA: the `agents.chat_composer.quick_actions` knob (system
 * default, overridable per organization and per person). Each entry names a
 * label and the agent JOB (mandate) it opens; the job resolves through the
 * mandate ladder (`useMandateSet`), exactly like today's /chat/new chips. An
 * entry whose job cannot resolve renders disabled with the reason — never a
 * silent fallback.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight } from "lucide-react";
import { isMandateKey, type MandateKey } from "@ai-matrx/agents/mandates";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveUserName } from "@/lib/redux/selectors/userSelectors";
import { useMandateSet } from "@/features/mandates/useMandateSet";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { cn } from "@/lib/utils";
import { COMPOSER_KNOBS } from "./composer-mode-cookie";

function timeOfDayGreeting(hour: number): string {
  if (hour < 5) return "Evening";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

const noSubscription = () => () => {};

export function ComposerGreeting({ className }: { className?: string }) {
  const userName = useAppSelector(selectActiveUserName);
  const firstName = (userName ?? "").trim().split(/\s+/)[0] || "";
  // The server has no clock for this person: it renders "Hello"; the client
  // snapshot is the local hour, so hydration never mismatches.
  const greeting = useSyncExternalStore(
    noSubscription,
    () => timeOfDayGreeting(new Date().getHours()),
    () => null,
  );
  return (
    <div className={cn("flex items-center justify-center gap-3.5", className)}>
      <span className="inline-block h-4 w-4 shrink-0 rounded-full bg-foreground" aria-hidden="true" />
      <h1 className="font-serif text-[clamp(2rem,1.6rem+1.8vw,2.875rem)] font-normal tracking-tight text-foreground">
        {greeting ?? "Hello"}
        {firstName ? `, ${firstName}` : ""}
      </h1>
    </div>
  );
}

interface QuickActionEntry {
  label: string;
  mandateKey: MandateKey;
}

function parseQuickActions(value: unknown): QuickActionEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: QuickActionEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const label = (item as { label?: unknown }).label;
    const key = (item as { mandateKey?: unknown }).mandateKey;
    // A key that came out of a setting a person may have edited is PROVEN, not cast.
    if (typeof label === "string" && label.trim() && isMandateKey(key)) {
      entries.push({ label, mandateKey: key });
    } else {
      console.error("[composer] a quick action in agents.chat_composer.quick_actions is not a {label, mandateKey} pair and is skipped:", item);
    }
  }
  return entries;
}

export function ComposerQuickActions({
  onLaunchAgent,
  className,
}: {
  /** Host decides what opening an agent means (the chat route stages + navigates). */
  onLaunchAgent: (agentId: string) => void;
  className?: string;
}) {
  const knob = useSessionKnob(COMPOSER_KNOBS.quickActions);
  // The list and every job it names resolve PER ORGANIZATION. With none active
  // yet there is nothing that could answer, so the row is absent (the org
  // chooser appears the moment the person acts) — never a pulse forever.
  const organizationId = useAppSelector((state) => state.appContext?.organization_id ?? null);
  const actions = parseQuickActions(knob);
  const mandates = useMandateSet(
    actions.map((a) => a.mandateKey),
    { enabled: Boolean(organizationId) },
  );
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const update = () => setCanScroll(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [actions.length]);

  if (!organizationId) return null;
  if (knob === undefined) {
    return (
      <div className={cn("flex h-[34px] gap-2 overflow-hidden", className)} aria-busy="true" aria-label="Loading quick actions">
        {[120, 104, 150, 132].map((w) => (
          <span key={w} className="h-[34px] shrink-0 animate-pulse rounded-lg bg-muted" style={{ width: w }} />
        ))}
      </div>
    );
  }
  if (actions.length === 0) return null;

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={scrollerRef}
        className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {actions.map((action) => {
          const state = mandates[action.mandateKey];
          const agentId = state?.mandate?.agentId ?? null;
          const unavailable = Boolean(state && !state.loading && state.error);
          return (
            <button
              key={`${action.mandateKey}:${action.label}`}
              type="button"
              disabled={!agentId}
              title={
                unavailable
                  ? `"${action.label}" is not available yet — its agent has not been assigned (${action.mandateKey}).`
                  : undefined
              }
              onClick={() => agentId && onLaunchAgent(agentId)}
              className={cn(
                "inline-flex h-[34px] shrink-0 items-center whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed",
                unavailable && "opacity-50",
              )}
            >
              {action.label}
            </button>
          );
        })}
      </div>
      {canScroll ? (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-[72px] bg-gradient-to-r from-transparent via-background/80 to-background"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => scrollerRef.current?.scrollBy({ left: 240, behavior: "smooth" })}
            className="absolute right-0 top-0 inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground"
            aria-label="More quick actions"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      ) : null}
    </div>
  );
}
