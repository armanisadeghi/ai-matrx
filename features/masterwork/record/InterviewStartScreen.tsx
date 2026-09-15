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
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-4">
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
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  ) : null}
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
                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  ) : null}
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

      <div className="flex items-center gap-2 pb-2">
        <Button
          size="sm"
          className="h-9"
          onClick={() => onStart({ mode, probes, closingSurprises, voiceOn })}
        >
          Start the interview
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
        {onBack ? (
          <Button size="sm" variant="ghost" className="h-9" onClick={onBack}>
            Back
          </Button>
        ) : null}
      </div>
    </div>
  );
}
