"use client";

/**
 * The Examples field — real inputs the new agent will get, "N of 3 to prove it" (R34/R52).
 * ONE component for every door that asks for them (/agents/new/generate, "Make an agent
 * from this chat"); controlled by its parent so each door feeds its own request.
 */

import { Plus } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { VoiceTextarea } from "@/components/official/VoiceTextarea";

/** Examples the proof needs (R34). */
export const EXAMPLES_TO_PROVE = 3;

export const emptyExamples = (): string[] => Array.from({ length: EXAMPLES_TO_PROVE }, () => "");

/** Only what the person actually wrote. */
export function filledExamples(examples: string[]): string[] {
  return examples.map((e) => e.trim()).filter(Boolean);
}

/** "N of 3 to prove it" — the ONE counter, used by the field and by a door that learns the real count (R55). */
export function ProofCount({ count }: { count: number }) {
  return (
    <span className="type-secondary text-muted-foreground tabular-nums">
      {count} of {EXAMPLES_TO_PROVE} to prove it
    </span>
  );
}

interface ExamplesFieldProps {
  examples: string[];
  onChange: (examples: string[]) => void;
  disabled?: boolean;
  /** Examples the door already supplies (the chat's own request counts as one). */
  supplied?: number;
}

export function ExamplesField({ examples, onChange, disabled, supplied = 0 }: ExamplesFieldProps) {
  const count = filledExamples(examples).length + supplied;
  return (
    <div className="space-y-2" data-testid="generator-examples">
      <Label className="text-xs sm:text-sm font-medium flex items-center gap-2">
        Examples
        <ProofCount count={count} />
      </Label>
      {examples.map((value, index) => (
        <VoiceTextarea
          key={index}
          aria-label={`Example ${index + 1}`}
          value={value}
          onChange={(e) => onChange(examples.map((v, i) => (i === index ? e.target.value : v)))}
          placeholder="A real input this agent will get"
          className="min-h-[64px] text-sm border border-border rounded-xl"
          disabled={disabled}
        />
      ))}
      <Button variant="quiet" icon={<Plus />} onClick={() => onChange([...examples, ""])} disabled={disabled}>
        Add example
      </Button>
    </div>
  );
}
