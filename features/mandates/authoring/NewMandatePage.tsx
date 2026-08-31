"use client";

// features/mandates/authoring/NewMandatePage.tsx
//
// /administration/mandates/new — the full purpose-built creation page.
// ADMIN-SIDE since 2026-08-29 (Arman): creating a mandate declares a job for
// the whole platform, so it lives with the rest of mandate management, and the
// server's POST /mandates is `require_super_admin` (aidream 304fe1848). The
// triad IS the page's spine: INPUT → GOAL → OUTPUT (Arman: "INPUT -> Charge
// (Goal) -> Output"). Inputs are DESCRIPTIVE ("descriptions of inputs… I can't
// give you snake case"); the GOAL is the heart and gets the space; OUTPUT is a
// kind pick plus a free-text constraints line. The server validates the key
// with the same validator the code path uses; its message renders verbatim.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Section } from "../workspace/Section";
import { TriadFlowMark } from "../workspace/TriadSections";
import { DraftInputsEditor } from "./DraftInputsEditor";
import { OutputKindPicker } from "./OutputKindPicker";
import { adminMandateHref } from "../browse/url-compat";
import { createMandate, type DraftInput } from "./service";
import { ProTextarea } from "@/components/official/ProTextarea";

/**
 * The three pieces a mandate cannot be created without, in the words the page
 * uses. Pure and exported so the guard can drive it directly — the whole point
 * of V2-4 is that this answer is recomputed, never remembered.
 */
export function missingCreationPieces(fields: {
  label: string;
  mandateKey: string;
  goal: string;
}): string[] {
  return [
    fields.label.trim().length === 0 ? "a name (the top field)" : null,
    fields.mandateKey.trim().length === 0 ? "the key" : null,
    fields.goal.trim().length === 0 ? "the goal" : null,
  ].filter((piece): piece is string => piece !== null);
}

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

  const missing = missingCreationPieces({ label, mandateKey, goal });

  /**
   * 🚨 THE REFUSAL IS DERIVED, NEVER STORED (V2-4, production walk
   * 2026-08-31). Pressing Create on the empty form used to WRITE the
   * missing-pieces sentence into `serverError` — the same state that holds the
   * server's verbatim key refusal. Nothing cleared it, so filling in the name,
   * the key and the goal left a red "still needs a name (the top field), the
   * key, the goal" standing under a form that had all three, three inches from
   * a grey line that had updated correctly. Two sentences about one form, one
   * of them false.
   *
   * The missing-pieces refusal is a pure function of the fields, so it is now
   * computed on every render and cannot go stale. The button carries it the
   * way `Apply` and `Set your own answer` already do on the binding screens
   * (UI-STANDARD 14): refused ON the control, with the reason beside it. The
   * `serverError` state holds ONLY what the server actually said, and it is
   * cleared the moment any field it could be about changes.
   */
  const create = async () => {
    if (missing.length > 0) return;
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
      toast.success(`${created.mandateKey} created — now choose who fulfils it.`);
      // THE CREATION HANDOFF (PLAN-ONE-BINDING-UI §3). This page keeps its one
      // job — name, described inputs, goal, output kind — and hands straight
      // into the one binding UI with the rung and holder cells empty. The
      // workspace's own honest line takes it from here ("No holder yet — pick
      // one to start mapping, or come back when the intelligence exists"); the
      // `#bind` fragment is what scrolls it into view on arrival.
      startTransition(() => {
        router.push(`${adminMandateHref(created.mandateKey)}#bind`);
      });
    } catch (error: unknown) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-2.5rem)] overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-2 sm:px-6">
        {/* Identity — a name people read, a key code calls. */}
        <header className="space-y-2">
          <div className="space-y-1 px-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
              Name
            </span>
            <Input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setServerError(null);
              }}
              placeholder="What this job is called — e.g. Goal writer"
              className="h-10 text-lg font-semibold tracking-tight"
              autoFocus
              aria-label="Mandate name"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Input
              value={mandateKey}
              onChange={(e) => {
                setMandateKey(e.target.value);
                // The server's refusal is about the key it was GIVEN. Once the
                // key changes the sentence describes a value that is no longer
                // on screen — it goes with it.
                setServerError(null);
              }}
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
              onChange={(e) => {
                setGoal(e.target.value);
                setServerError(null);
              }}
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
            disabled={creating || pending || missing.length > 0}
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
          {/* The refused control's reason, ADJACENT — never a red sentence
              somewhere else on the page that outlives the condition. */}
          <span
            className={
              missing.length > 0
                ? "text-[11.5px] text-muted-foreground"
                : "text-[11.5px] text-muted-foreground/70"
            }
          >
            {missing.length > 0
              ? `Not yet — this mandate still needs ${missing.join(", ")}.`
              : "No agent needed yet — bind one whenever it exists."}
          </span>
        </div>
      </div>
    </div>
  );
}
