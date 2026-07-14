"use client";

// features/education/spoken-practice/components/SpokenPracticeSurface.tsx
//
// Top-level Spoken Practice surface. Owns the session hook and routes between the
// mode picker (home), the per-mode setup, the live runner, and the summary based
// on the runner phase. Mode is deep-linkable via ?mode= (home is skipped when a
// valid mode is passed).

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpokenPractice } from "../hooks/useSpokenPractice";
import { isSpokenPracticeMode, type SpokenPracticeMode } from "../types";
import { SpokenPracticeHome } from "./SpokenPracticeHome";
import { PracticeSetup } from "./PracticeSetup";
import { PracticeRunner } from "./PracticeRunner";
import { PracticeSummary } from "./PracticeSummary";

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

  if (phase === "error") {
    return (
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
  }

  if (phase === "summary" && selectedMode) {
    return <PracticeSummary mode={selectedMode} practice={practice} />;
  }

  if (phase !== "idle" && selectedMode) {
    return <PracticeRunner mode={selectedMode} practice={practice} />;
  }

  // idle → pick a mode, then configure.
  if (!selectedMode) {
    return <SpokenPracticeHome onPick={setSelectedMode} />;
  }
  return (
    <PracticeSetup
      mode={selectedMode}
      onBack={() => setSelectedMode(null)}
      start={practice.start}
    />
  );
}
