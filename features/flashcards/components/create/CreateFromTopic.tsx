"use client";

// features/flashcards/components/create/CreateFromTopic.tsx
//
// The first end-to-end AI flow for the canonical Flashcards tool: type a topic
// → the live generateCards agent (FC_AGENTS.generateCards, gemini-3.5-flash)
// returns a structured set → a real fc_set + fc_card rows are created → the
// user is navigated into the new set, ready to study.
//
// The agent round-trip lives in useGenerateCards (reused by future from-source /
// quiz flows). Persistence is fcService.createSetWithCards. Navigation uses
// useTransition. Errors surface loudly via sonner toast.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Layers, Sparkles, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/ui/spinner";
import { FC_AGENTS } from "../../data/agents";
import { fcService } from "../../data/fcService";
import { useGenerateCards } from "../../data/useGenerateCards";

const EDU_BASE = "/education/flashcards";

const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
] as const;

type Difficulty = (typeof DIFFICULTIES)[number]["value"];

const COUNT_MIN = 1;
const COUNT_MAX = 50;

// 16px+ inputs prevent the iOS zoom-on-focus; semantic colors throughout.
const FIELD_INPUT_CLASS = "text-base";

export function CreateFromTopic() {
  const router = useRouter();
  const { generate, isGenerating } = useGenerateCards();
  const [isNavigating, startNavigation] = useTransition();

  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [gradeLevel, setGradeLevel] = useState("");
  const [userRequest, setUserRequest] = useState("");

  // True from the click through agent-run + persistence + the route push, so
  // the whole form stays locked and the button shows real progress.
  const busy = isGenerating || isNavigating;

  const trimmedTopic = topic.trim();
  const canSubmit = trimmedTopic.length > 0 && !busy;

  const goBack = () => {
    startNavigation(() => router.push(EDU_BASE));
  };

  const handleGenerate = async () => {
    if (!canSubmit) return;
    const safeCount = Math.min(COUNT_MAX, Math.max(COUNT_MIN, count || 10));

    try {
      const result = await generate(FC_AGENTS.generateCards, {
        topic: trimmedTopic,
        count: safeCount,
        difficulty,
        grade_level: gradeLevel.trim() || undefined,
        user_request: userRequest.trim() || undefined,
      });

      const setRes = await fcService.createSetWithCards(
        {
          name: result.set_title?.trim() || trimmedTopic,
          topic: trimmedTopic,
          difficulty,
        },
        result.cards,
      );

      if (setRes.error || !setRes.data) {
        toast.error(setRes.error ?? "Could not save the generated flashcard set");
        return;
      }

      const { set, cards } = setRes.data;
      toast.success(
        `Created "${set.name}" with ${cards.length} ${cards.length === 1 ? "card" : "cards"}`,
      );
      startNavigation(() => router.push(`${EDU_BASE}/${set.id}`));
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to generate flashcards";
      toast.error(message);
    }
  };

  return (
    <div className="min-h-full w-full bg-textured">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={goBack}
            disabled={busy}
            aria-label="Back to flashcards"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              New flashcard set
            </h1>
            <p className="text-sm text-muted-foreground">
              Describe a topic and let AI build a study set you can review right
              away.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-6">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <LoadingSpinner size="lg" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Generating {Math.min(COUNT_MAX, Math.max(COUNT_MIN, count || 10))}{" "}
                  cards about &ldquo;{trimmedTopic}&rdquo;
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This usually takes a few seconds. Hang tight.
                </p>
              </div>
            </div>
          ) : (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleGenerate();
              }}
            >
              {/* Topic */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fc-topic">
                  Topic <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fc-topic"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Photosynthesis, the French Revolution, React hooks"
                  className={FIELD_INPUT_CLASS}
                  disabled={busy}
                  autoFocus
                  required
                />
              </div>

              {/* Count + Difficulty */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fc-count">Number of cards</Label>
                  <Input
                    id="fc-count"
                    type="number"
                    min={COUNT_MIN}
                    max={COUNT_MAX}
                    value={count}
                    onChange={(e) =>
                      setCount(Number.parseInt(e.target.value, 10) || 0)
                    }
                    className={FIELD_INPUT_CLASS}
                    disabled={busy}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Between {COUNT_MIN} and {COUNT_MAX}.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fc-difficulty">Difficulty</Label>
                  <Select
                    value={difficulty}
                    onValueChange={(v) => setDifficulty(v as Difficulty)}
                    disabled={busy}
                  >
                    <SelectTrigger id="fc-difficulty" className={FIELD_INPUT_CLASS}>
                      <SelectValue placeholder="Select difficulty" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIFFICULTIES.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Grade level (optional) */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fc-grade">
                  Grade / level{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="fc-grade"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  placeholder="e.g. 9th grade, undergraduate, beginner"
                  className={FIELD_INPUT_CLASS}
                  disabled={busy}
                />
              </div>

              {/* User request (optional) */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="fc-focus">
                  Focus or emphasis{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="fc-focus"
                  value={userRequest}
                  onChange={(e) => setUserRequest(e.target.value)}
                  placeholder="Anything specific to cover or avoid — e.g. focus on key vocabulary and skip dates."
                  className={`${FIELD_INPUT_CLASS} min-h-20 resize-y`}
                  disabled={busy}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={goBack}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {busy ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1.5 h-4 w-4" />
                  )}
                  {isNavigating ? "Opening…" : "Generate"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
