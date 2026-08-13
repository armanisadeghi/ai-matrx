"use client";

// features/education/spoken-practice/components/SpokenPracticeSurface.tsx
//
// Top-level Spoken Practice surface. Owns the session hook and routes between the
// mode picker (home), the per-mode setup, the live runner, and the summary based
// on the runner phase. Mode is deep-linkable via ?mode= (home is skipped when a
// valid mode is passed).
//
// This is also the surface EMITTER for `matrx-user/education-practice-oral`. It
// spans all four screens, so it is the one place that can emit the whole
// surface; the setup form publishes its own slice into `../setupSnapshot.ts`,
// which `buildSpokenPracticeScope` reads synchronously (the Surface Context
// window samples getScope every 400ms, so it must never fetch).
//
// It registers ONE write handler — `practice_mode` — and only while no session
// is running. `practice_setup` is registered by PracticeSetup itself, because
// that component owns the form state. `listAgentWritableTargets()` filters on a
// live handler, so an agent on the runner or the summary is offered no write
// tool at all: starting, answering and grading are the learner's, and every
// number those screens show is measured evidence.
//
// React Compiler is on: no manual memo.

import { useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useSpokenPractice } from "../hooks/useSpokenPractice";
import { buildSpokenPracticeScope } from "../spokenPracticeScope";
import { MODE_VOCABULARY } from "../vocabulary";
import {
  isSpokenPracticeMode,
  SPOKEN_PRACTICE_MODES,
  type SpokenPracticeMode,
} from "../types";
import { SpokenPracticeHome } from "./SpokenPracticeHome";
import { PracticeSetup } from "./PracticeSetup";
import { PracticeRunner } from "./PracticeRunner";
import { PracticeSummary } from "./PracticeSummary";

const SURFACE_NAME = "matrx-user/education-practice-oral";

export function SpokenPracticeSurface({
  initialMode,
}: {
  initialMode?: string | null;
}) {
  const practice = useSpokenPractice();
  const [selectedMode, setSelectedMode] = useState<SpokenPracticeMode | null>(
    initialMode && isSpokenPracticeMode(initialMode) ? initialMode : null,
  );

  const { phase } = practice;

  // Read at Run time from live render state + the setup snapshot store. Kept
  // synchronous on purpose (see the file header).
  const getScope = () =>
    buildSpokenPracticeScope({
      selectedMode,
      phase,
      plan: practice.plan,
      index: practice.index,
      sessionId: practice.sessionId,
      results: practice.results,
      grade: practice.grade,
      review: practice.review,
      liveConversationId: practice.liveConversationId,
      error: practice.error,
    });

  /**
   * Write half — the mode pick only, and only before a session exists. Once the
   * microphone is open the practice type is fixed, so we register NOTHING
   * rather than offering a target that would have to refuse every call.
   */
  const getWriteHandlers = () =>
    phase !== "idle"
      ? {}
      : {
          practice_mode: (value: unknown) => {
            if (typeof value !== "string" || !isSpokenPracticeMode(value))
              throw new Error(
                `practice_mode must be exactly one of ${SPOKEN_PRACTICE_MODES.map(
                  (m) => `"${m}" (${MODE_VOCABULARY[m].label})`,
                ).join(", ")}; received ${JSON.stringify(value)}.`,
              );
            // The SAME setter the learner's click on a mode card goes through.
            setSelectedMode(value);
          },
        };

  // The provider wraps every screen so the surface stays mounted (and readable)
  // for the whole session, not just while one phase is showing.
  let body: ReactNode;
  if (phase === "error") {
    body = (
      <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 p-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
          <AlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
        </div>
        <p className="text-sm text-foreground">
          {practice.error ?? "Something went wrong."}
        </p>
        <Button onClick={practice.reset}>Try again</Button>
      </div>
    );
  } else if (phase === "summary" && selectedMode) {
    body = <PracticeSummary mode={selectedMode} practice={practice} />;
  } else if (phase !== "idle" && selectedMode) {
    body = <PracticeRunner mode={selectedMode} practice={practice} />;
  } else if (!selectedMode) {
    // idle → pick a mode, then configure.
    body = <SpokenPracticeHome onPick={setSelectedMode} />;
  } else {
    body = (
      <PracticeSetup
        mode={selectedMode}
        onBack={() => setSelectedMode(null)}
        start={practice.start}
      />
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
    >
      {body}
    </SurfaceRuntimeProvider>
  );
}
