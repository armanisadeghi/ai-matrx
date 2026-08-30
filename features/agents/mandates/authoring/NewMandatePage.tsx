"use client";

// features/agents/mandates/authoring/NewMandatePage.tsx
//
// /agents/mandates/new — the full purpose-built creation page. The triad IS
// the page's spine: INPUT → GOAL → OUTPUT (Arman: "INPUT -> Charge (Goal) ->
// Output"). Inputs are DESCRIPTIVE ("descriptions of inputs… I can't give you
// snake case"); the GOAL is the heart and gets the space; OUTPUT is a kind
// pick plus a free-text constraints line. The server validates the key with
// the same validator the code path uses; its message renders verbatim.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Section } from "../workspace/Section";
import { TriadFlowMark } from "../workspace/TriadSections";
import { DraftInputsEditor } from "./DraftInputsEditor";
import { OutputKindPicker } from "./OutputKindPicker";
import { createMandate, type DraftInput } from "./service";
import { ProTextarea } from "@/components/official/ProTextarea";

export function NewMandatePage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState("");
  const [mandateKey, setMandateKey] = useState("");
  const [goal, setGoal] = useState("");
  const [draftInputs, setDraftInputs] = useState<DraftInput[]>([
    { description: "" },
  ]);
  const [outputKind, setOutputKind] = useState<string | null>(null);
  const [outputConstraints, setOutputConstraints] = useState("");
  const [creating, setCreating] = useState(false);
  /** The server's refusal, verbatim — the key validator's words are the copy. */
  const [serverError, setServerError] = useState<string | null>(null);

  const ready =
    label.trim().length > 0 && mandateKey.trim().length > 0 && goal.trim().length > 0;

  const create = async () => {
    setCreating(true);
    setServerError(null);
    try {
      const created = await createMandate(dispatch, {
        mandateKey,
        label,
        goal,
        outputKind,
        outputConstraints,
        draftInputs,
      });
      toast.success(`${created.mandateKey} created.`);
      startTransition(() => {
        router.push(`/agents/mandates/${encodeURIComponent(created.mandateKey)}`);
      });
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto pt-[calc(var(--shell-header-h)+0.5rem)]">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-2 sm:px-6">
        {/* Identity — a name people read, a key code calls. */}
        <header className="space-y-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="What this job is called — e.g. Goal writer"
            className="h-10 border-none bg-transparent px-1 text-lg font-semibold tracking-tight shadow-none focus-visible:ring-0"
            autoFocus
            aria-label="Mandate name"
          />
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Input
              value={mandateKey}
              onChange={(e) => setMandateKey(e.target.value)}
              placeholder="feature.specific_job"
              className="h-8 w-72 font-mono text-[12.5px]"
              aria-label="Mandate key"
            />
            <span className="text-[11px] text-muted-foreground/70">
              lowercase, dot-separated — code calls this key forever
            </span>
          </div>
          {serverError ? (
            <p className="px-1 text-[12.5px] text-destructive">{serverError}</p>
          ) : null}
        </header>

        {/* THE TRIAD */}
        <Section title="Input" hint="describe them — formalize later">
          <div className="rounded-xl border border-border/60 bg-card p-4">
            <DraftInputsEditor items={draftInputs} onChange={setDraftInputs} />
          </div>
        </Section>

        <TriadFlowMark />

        <Section title="Goal" hint="lives only here — give it your best words">
          <div className="rounded-xl border border-primary/25 bg-card p-4">
            <ProTextarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Exactly what done-well means. Tight, opinionated, no fluff — intelligent agents will turn this into a system prompt and a grading rubric."
              rows={8}
              className="min-h-40 border-none bg-transparent p-0 text-[14.5px] leading-relaxed shadow-none focus-visible:ring-0"
              aria-label="Goal"
            />
          </div>
        </Section>

        <TriadFlowMark />

        <Section title="Output">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-4">
            <OutputKindPicker value={outputKind} onSelect={setOutputKind} />
            <Input
              value={outputConstraints}
              onChange={(e) => setOutputConstraints(e.target.value)}
              placeholder="Constraints — e.g. markdown text, max 200 words"
              className="h-8 min-w-56 flex-1 text-[13px]"
              aria-label="Output constraints"
            />
          </div>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <Button
            disabled={!ready || creating || pending}
            onClick={() => void create()}
            className="gap-1.5"
          >
            {creating || pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
            {creating ? "Creating…" : "Create mandate"}
          </Button>
          <span className="text-[11.5px] text-muted-foreground/70">
            No agent needed yet — bind one whenever it exists.
          </span>
        </div>
      </div>
    </div>
  );
}
