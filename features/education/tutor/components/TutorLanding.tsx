"use client";

// features/education/tutor/components/TutorLanding.tsx
//
// Empty-state greeting for a fresh AI Tutor conversation. Sets the tone (a
// grounded, honest study companion — not a generic chatbot) and offers a few
// starter prompts that drop straight into the composer. Rendered by
// AgentConversationColumn's `landingContent` slot while the conversation has
// zero messages.

import { GraduationCap, ShieldCheck, Sparkles } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import { cn } from "@/lib/utils";

const STARTERS: string[] = [
  "Quiz me on my weakest topic",
  "Explain the concept I've been struggling with most",
  "Help me make a study plan for my next exam",
  "Give me a Socratic walkthrough of something I studied recently",
];

export interface TutorLandingProps {
  /** The live conversation to drop a starter prompt into. */
  conversationId?: string;
}

export function TutorLanding({ conversationId }: TutorLandingProps) {
  const dispatch = useAppDispatch();

  const pick = (text: string) => {
    if (!conversationId) return;
    dispatch(setUserInputText({ conversationId, text }));
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <GraduationCap className="h-7 w-7" aria-hidden />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Your AI Tutor</h1>
        <p className="text-sm text-muted-foreground">
          A personal tutor that remembers what you&apos;ve studied, is grounded in
          your own material, and is honest about what it doesn&apos;t know.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
          <ShieldCheck className="h-3.5 w-3.5 text-green-600" aria-hidden />
          Cites your material
        </span>
        <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
          Remembers your progress
        </span>
      </div>

      {conversationId && (
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pick(s)}
              className={cn(
                "rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-foreground transition-colors",
                "hover:border-primary/40 hover:bg-accent",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
