"use client";

// features/masterwork/record/InterviewStartScreen.tsx
//
// "Both are great. Make them two modes, engaged by user preference or by the
//  system recognizing which works better." — Arman, 2026-09-15
//
// THE SCREEN WHERE THE EXPERT CHOOSES their interviewer, before a fresh
// interview mints a conversation. Everything on it is a setting with a resolved
// default (`useInterviewSettings`); nothing here is hardcoded taste, and nothing
// here is a question the Expert has to answer — every control arrives already
// answered, and pressing Start without touching anything is the intended path.
//
// THE THREE STATES ARE ALL HONEST (law 4): while the settings are resolving the
// screen waits and says so; if the read fails it says what failed and offers to
// try again; it never quietly picks an interviewer for them.

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Loader2, Mic, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  INTERVIEW_CONTEXT_MODES,
  INTERVIEW_PROBES,
  autoReason,
  resolveContextMode,
  type InterviewContextMode,
  type InterviewProbe,
} from "./interviewModes";
import { useInterviewSettings } from "./useInterviewSettings";
import { useRulebookSourceCount } from "../sourceLinks";

export interface InterviewChoice {
  mode: InterviewContextMode;
  probes: InterviewProbe[];
  closingSurprises: boolean;
  voiceOn: boolean;
}

export interface InterviewStartScreenProps {
  rulebookId: string;
  rulebookOrganizationId: string | null | undefined;
  /** Shown when the Expert has prior interviews and came here from the list. */
  onBack?: () => void;
  onStart: (choice: InterviewChoice) => void;
}

export function InterviewStartScreen({
  rulebookId,
  rulebookOrganizationId,
  onBack,
  onStart,
}: InterviewStartScreenProps) {
  const settings = useInterviewSettings(rulebookId, rulebookOrganizationId);
  const sources = useRulebookSourceCount(rulebookId, rulebookOrganizationId);

  const [mode, setMode] = useState<InterviewContextMode | null>(null);
  const [probes, setProbes] = useState<InterviewProbe[] | null>(null);
  const [closingSurprises, setClosingSurprises] = useState<boolean | null>(null);
  const [voiceOn, setVoiceOn] = useState<boolean | null>(null);

  const hasSources = sources.state === "ready" ? sources.count > 0 : null;

  // Seed the controls from the resolved settings ONCE both answers are in. A
  // control seeded from a half-resolved answer would show the Expert a choice
  // nobody made.
  const resolvedMode = useMemo(() => {
    if (settings.state !== "ready" || hasSources === null) return null;
    return resolveContextMode(settings.contextMode, hasSources);
  }, [settings, hasSources]);

  useEffect(() => {
    if (settings.state !== "ready" || resolvedMode === null) return;
    setMode((current) => current ?? resolvedMode);
    setProbes((current) => current ?? settings.probes);
    setClosingSurprises((current) => current ?? settings.closingSurprises);
    setVoiceOn((current) => current ?? settings.voiceDefaultOn);
  }, [settings, resolvedMode]);

  const failure =
    settings.state === "failed"
      ? { reason: settings.reason, retry: settings.retry }
      : sources.state === "failed"
        ? { reason: sources.reason, retry: sources.retry }
        : null;
  if (failure) {
    return (
      <div className="flex h-full flex-col items-start gap-3 px-4 py-6 text-sm">
        <p className="text-foreground">
          We can&apos;t start an interview yet, because we couldn&apos;t read your
          interview settings — so we don&apos;t know which interviewer you asked for.
        </p>
        <p className="text-xs text-muted-foreground">{failure.reason}</p>
        <Button size="sm" variant="outline" onClick={failure.retry}>
          <RotateCw className="mr-1 h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  if (
    settings.state !== "ready" ||
    mode === null ||
    probes === null ||
    closingSurprises === null ||
    voiceOn === null
  ) {
    return (
      <div className="flex h-full items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Getting your interview settings…
      </div>
    );
  }

  const toggleProbe = (probe: InterviewProbe) => {
    setProbes((current) => {
      const list = current ?? [];
      // "Let it choose" and a hand-picked set are different answers, never a
      // mixture — picking one clears the other rather than pretending both.
      if (probe === "adaptive") return ["adaptive"];
      const without = list.filter((p) => p !== "adaptive");
      const next = without.includes(probe)
        ? without.filter((p) => p !== probe)
        : [...without, probe];
      return next.length > 0 ? next : ["adaptive"];
    });
  };

  const autoNote =
    settings.contextMode === "auto" && hasSources !== null
      ? autoReason(hasSources)
      : null;

  return (
    /* 🚨 THE WAY OUT IS ALWAYS ON SCREEN (jobs-bar-2026-09-16, item 26).
       "Start the interview" used to be the last thing in a scrolling column,
       under two context cards, NINE probe cards and two switches — below the
       fold on a 1440×900 desktop and several screens down on a phone. Every
       control here already arrives answered, and pressing Start without
       touching one of them is the intended path, so the intended path was the
       one thing you could not see. It is pinned now, and the column is centred
       like every other Masterwork lane instead of stretching nine cards across
       a wide monitor (item 29). */
    <div className="flex h-full flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-4">
        <section className="space-y-1">
          <h2 className="text-base font-semibold text-foreground">
            Before we start
          </h2>
          {/* WHAT IT COSTS ME, BEFORE I AGREE TO IT (item 27). Nothing on this
              screen said how long an interview runs or that stopping is
              allowed, so the only honest reading of "Start the interview" was
              "begin something of unknown length". */}
          <p className="text-xs text-muted-foreground">
            A session usually runs ten to twenty minutes, one question at a
            time. Stop whenever you like — everything you have said is already
            saved, and you can pick this interview up again later.
          </p>
        </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">
          What should the interviewer know about you before it starts?
        </h2>
        <p className="text-xs text-muted-foreground">
          Both ways work well, and they find different things. You can change this
          any time.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTERVIEW_CONTEXT_MODES.map((option) => {
            const selected = option.id === mode;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setMode(option.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                {/* 🚨 THE TITLE DOES NOT MOVE (jobs-bar-2026-09-16, item 28).
                    The tick used to be inserted into the flow on select, so
                    every card's title jumped sideways the moment it was chosen
                    — nine cards twitching as the Expert makes up her mind. The
                    space is reserved either way. */}
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-primary",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {option.title}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{option.sentence}</p>
                {selected && autoNote ? (
                  <p className="mt-1.5 text-xs italic text-muted-foreground">
                    {autoNote}
                  </p>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-foreground">
          How should it dig?
        </h2>
        <p className="text-xs text-muted-foreground">
          Pick as many as you like, or let it choose.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTERVIEW_PROBES.map((option) => {
            const selected = probes.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleProbe(option.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-primary/40",
                )}
              >
                {/* 🚨 THE TITLE DOES NOT MOVE (jobs-bar-2026-09-16, item 28).
                    The tick used to be inserted into the flow on select, so
                    every card's title jumped sideways the moment it was chosen
                    — nine cards twitching as the Expert makes up her mind. The
                    space is reserved either way. */}
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Check
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-primary",
                      selected ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {option.title}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{option.sentence}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-border bg-card p-3">
        <label className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Mic className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              Talk it through out loud
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Adds the hands-free voice bar, so you can hold a spoken
              back-and-forth. The microphone for dictating one answer is in the
              message box either way.
            </span>
          </span>
          <Switch checked={voiceOn} onCheckedChange={setVoiceOn} />
        </label>
        <label className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="text-sm font-medium text-foreground">
              End with what surprised it
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              The session finishes with the three things you said that the
              interviewer did not expect.
            </span>
          </span>
          <Switch checked={closingSurprises} onCheckedChange={setClosingSurprises} />
        </label>
      </section>

      </div>

      <div className="shrink-0 border-t border-border bg-background/95 pb-safe backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-3">
          <Button
            className="h-11 flex-1 text-base sm:h-9 sm:flex-none sm:text-sm"
            onClick={() => onStart({ mode, probes, closingSurprises, voiceOn })}
          >
            Start the interview
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
          {onBack ? (
            <Button
              variant="ghost"
              className="h-11 sm:h-9"
              onClick={onBack}
            >
              Back
            </Button>
          ) : null}
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Nothing here has to be changed — these are already set for you.
          </span>
        </div>
      </div>
    </div>
  );
}
