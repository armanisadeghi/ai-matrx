"use client";

// features/mandates/workspace/TriadSections.tsx
//
// THE TRIAD — the mandate page's spine, in the mandate's own order:
//
//     INPUT  →  GOAL  →  OUTPUT
//
// Arman: "INPUT -> Charge (Goal) -> Output. The UI should show this clearly
// and since the goal lives ONLY HERE, it needs to be easy to read and quickly
// edit." The goal is read from `mandate.definition.goal` (the ONE home,
// post-1W), edited in place through PATCH /mandates/{key}/goal, and every edit
// grounds it 'H' — permanent platform-wide (the boot sync only refreshes 'A'
// goals). Copy is tight everywhere; the data does the talking.
//
// 🚨 `authoring` — WHERE, not who (Arman, 2026-08-29). A mandate's goal and
// its declared inputs are SYSTEM definitions: one edit changes the job for
// every user on the platform. So they are editable ONLY on the admin route
// (/administration/mandates/[key]); everywhere else — the user route,
// the window panel — the same sections render READ-ONLY. The server agrees:
// PATCH /mandates/{key}/goal and /draft-inputs are `require_super_admin`
// (aidream 304fe1848), so an ungated pencil here would just be a 403 waiting
// to happen.

import { useMemo, useState } from "react";
import {
  ArrowDown,
  Check,
  Lock,
  MessageSquareText,
  Package,
  Pencil,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { toast } from "@/lib/toast";
import { useAppDispatch } from "@/lib/redux/hooks";
import { goalOfMandate } from "@/lib/supabase/mandateStorage";
import { ProvisionOfferList } from "../components/ProvisionOfferList";
import { AutomationButton } from "../authoring/AutomationButton";
import {
  GOAL_WRITER_MANDATE_KEY,
  KIND_CONVERTER_MANDATE_KEY,
} from "../authoring/constants";
import {
  parseDraftInputs,
  patchMandateDraftInputs,
  patchMandateGoal,
  type DraftInput,
} from "../authoring/service";
import { DraftInputsEditor } from "../authoring/DraftInputsEditor";
import { isUserTextOnly, useMandateInputSurface } from "../input-surface";
import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
import { Section } from "./Section";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";
import { ProTextarea } from "@/components/official/ProTextarea";

/** Plain words for H/V/A — never the letter alone. */
export function GroundingBadge({ grounding }: { grounding: string | null }) {
  const spec =
    grounding === "H"
      ? { label: "Human-ratified", className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" }
      : grounding === "V"
        ? { label: "Verified", className: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400" }
        : { label: "Agent-written", className: "text-muted-foreground" };
  return (
    <Badge variant="outline" className={`py-0 text-[10px] ${spec.className}`}>
      {spec.label}
    </Badge>
  );
}

/** The arrow between triad sections — the flow, stated visually once. */
export function TriadFlowMark() {
  return (
    <div className="flex justify-center py-0.5">
      <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/50" />
    </div>
  );
}

// ── INPUT ────────────────────────────────────────────────────────────────────

export function TriadInputSection({
  data,
  onChanged,
  authoring = false,
}: {
  data: MandateWorkspaceData;
  onChanged: () => void;
  /** Admin route only — see the `authoring` note at the top of this file. */
  authoring?: boolean;
}) {
  const dispatch = useAppDispatch();
  const draftInputs = parseDraftInputs(
    (data.mandate as { draft_inputs?: unknown }).draft_inputs,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftInput[]>(draftInputs);
  const [saving, setSaving] = useState(false);
  // THE MANDATE DOOR: the key goes to the server, which resolves the Holder.
  // `AutomationButton` below owns the availability gate (its own `useMandate`
  // probe), so an unbound automation key never reaches this run.
  const convert = useHeadlessAgentJson();
  const [converting, setConverting] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await patchMandateDraftInputs(dispatch, data.mandate.mandate_key, draft);
      setEditing(false);
      onChanged();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  /**
   * What this screen holds for the CONVERTER, by served input name. That job
   * does not exist yet (`constants.ts` says so, and the button renders honestly
   * disabled naming it) — so these names are this screen's best offer and the
   * seam matches whatever the job declares WHEN somebody creates it. Anything
   * it serves that is not here is either asked of the person inline or reported
   * as gone-without; nothing is guessed and nothing fails silently.
   */
  const convertValues = useMemo(
    () => ({
      task_overview: [
        `Job: ${data.mandate.label ?? data.mandate.mandate_key}`,
        `Key: ${data.mandate.mandate_key}`,
        `Goal: ${goalOfMandate(data.mandate) ?? "(none written yet)"}`,
      ].join("\n"),
      inputs: draftInputs
        .map((i) => [i.description, i.name ? `(${i.name})` : ""].filter(Boolean).join(" "))
        .join("\n"),
      draft_inputs: JSON.stringify(draftInputs),
    }),
    [data.mandate, draftInputs],
  );

  const runConvert = async (variables: Record<string, string>) => {
    setConverting(true);
    try {
      const text = await convert.run<string>({
        mandateKey: KIND_CONVERTER_MANDATE_KEY,
        surfaceKey: `mandate:${KIND_CONVERTER_MANDATE_KEY}`,
        sourceFeature: "agent-builder",
        expect: "text",
        initiation: "user",
        // Served names only — see `convertValues`.
        variables,
      });
      toast.success("Structure proposal ready — review below.");
      setDraft(applyConversion(draftInputs, text));
      setEditing(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setConverting(false);
    }
  };

  return (
    <Section title="Input" hint={inputHint(data, draftInputs.length)}>
      <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
        {data.offer ? (
          <ProvisionOfferList
            values={data.offer.values}
            pinnedContext={data.pinnedContext}
          />
        ) : editing ? (
          <div className="space-y-2">
            <DraftInputsEditor items={draft} onChange={setDraft} />
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-7 gap-1 text-[12px]" disabled={saving} onClick={() => void save()}>
                <Check className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save inputs"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[12px]"
                onClick={() => {
                  setDraft(draftInputs);
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            </div>
          </div>
        ) : draftInputs.length > 0 ? (
          <ul className="space-y-1">
            {draftInputs.map((item, index) => (
              <li key={index} className="flex items-baseline gap-2 text-[13px]">
                <Package className="h-3 w-3 shrink-0 translate-y-0.5 text-muted-foreground" />
                <span className="text-foreground">{item.description}</span>
                {item.name ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                    {item.name}
                  </code>
                ) : null}
                {item.kind ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {item.kind}
                  </code>
                ) : null}
              </li>
            ))}
          </ul>
        ) : data.contract.requiredVariables.length > 0 ? (
          <div>
            <p className="text-[11px] text-muted-foreground">
              Legacy contract — required variables (no Provision yet):
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {data.contract.requiredVariables.map((name) => (
                <code key={name} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                  {name}
                </code>
              ))}
            </div>
          </div>
        ) : (
          // 🚨 "User text only" is a MEASURED answer, never a fallback. The
          // served input surface is the one thing that knows all four
          // declarations (Provision · contract · this mandate's described
          // inputs · the bound Holder's own variables), so this branch asks it
          // rather than concluding "nothing" from the two it can see locally.
          <HolderDeclaredInputs mandateKey={data.mandate.mandate_key} />
        )}

        {authoring && !data.offer && !editing ? (
          <div className="flex items-center gap-1.5 pt-0.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[12px]"
              onClick={() => {
                setDraft(draftInputs.length > 0 ? draftInputs : [{ description: "" }]);
                setEditing(true);
              }}
            >
              <Pencil className="h-3 w-3" />
              {draftInputs.length > 0 ? "Edit inputs" : "Describe inputs"}
            </Button>
            {draftInputs.length > 0 ? (
              <AutomationButton
                mandateKey={KIND_CONVERTER_MANDATE_KEY}
                label="Convert to structure"
                runningLabel="Converting…"
                running={converting}
                knownValues={convertValues}
                onRun={(variables) => void runConvert(variables)}
              />
            ) : null}
          </div>
        ) : null}

        <p className="flex items-center gap-1.5 border-t border-border/40 pt-2 text-[11.5px] text-muted-foreground/80">
          <MessageSquareText className="h-3 w-3" />
          Free text from the caller is accepted (platform default).
        </p>
        {Object.keys(data.pins).length > 0 ? (
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/80">
            <Lock className="h-3 w-3" />
            Pinned behaviors:{" "}
            {Object.entries(data.pins)
              .map(([k, v]) => `${k}=${String(v)}`)
              .join(" · ")}{" "}
            (platform-locked)
          </p>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * THE LAST RESORT of the Input section — and the only place allowed to say
 * "user text only".
 *
 * Before 2026-08-31 this branch was a bare sentence: "User text only —
 * nothing declared, nothing offered." It was false for every mandate whose
 * bound agent declares variables, which is most of them. The served surface
 * (`GET /mandates/{key}/input-surface`) is the one reader that knows all four
 * declarations, so the sentence is now its answer, not our assumption.
 */
function HolderDeclaredInputs({ mandateKey }: { mandateKey: string }) {
  const state = useMandateInputSurface(mandateKey);
  if (state.status === "loading") {
    return (
      <p className="text-[13px] text-muted-foreground">Reading this job&apos;s inputs…</p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="text-[13px] text-destructive">
        This job&apos;s inputs could not be read: {state.message}
      </p>
    );
  }
  const { surface } = state;
  if (isUserTextOnly(surface)) {
    return (
      <p className="text-[13px] text-muted-foreground">
        User text only — nothing declared in code, on this job, or by the agent
        that fulfils it.
      </p>
    );
  }
  if (surface.inputs.length === 0) {
    return (
      <ul className="space-y-1">
        {surface.notes.map((note) => (
          <li key={note} className="text-[12.5px] text-amber-700 dark:text-amber-400">
            {note}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground">
        Declared by{" "}
        {surface.holderName ?? "the agent that fulfils this job"} — this job has
        no Provision of its own, so what the Holder accepts IS its input
        surface.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {surface.inputs.map((input) => (
          <code
            key={input.name}
            className="rounded bg-muted px-1.5 py-0.5 text-[11px]"
            title={input.help || undefined}
          >
            {input.name}
          </code>
        ))}
      </div>
    </div>
  );
}

function inputHint(data: MandateWorkspaceData, draftCount: number): string {
  if (data.offer) return `Provision — ${data.offer.values.length} values offered`;
  if (draftCount > 0) return `${draftCount} described — formalize later`;
  return "";
}

/** Best-effort: a conversion result that parses as draft-input JSON replaces
 * the rows; anything else keeps the rows and lands as a note row for review. */
function applyConversion(current: DraftInput[], output: string): DraftInput[] {
  try {
    const parsed: unknown = JSON.parse(output);
    const candidate = Array.isArray(parsed)
      ? parsed
      : (parsed as { draft_inputs?: unknown })?.draft_inputs;
    if (Array.isArray(candidate)) {
      const rows = parseDraftInputs(candidate);
      if (rows.length > 0) return rows;
    }
  } catch {
    // Not JSON — fall through.
  }
  return current;
}

// ── GOAL ─────────────────────────────────────────────────────────────────────

export function TriadGoalSection({
  data,
  onChanged,
  authoring = false,
}: {
  data: MandateWorkspaceData;
  onChanged: () => void;
  /** Admin route only — see the `authoring` note at the top of this file. */
  authoring?: boolean;
}) {
  const dispatch = useAppDispatch();
  const goal = goalOfMandate(data.mandate);
  const grounding =
    ((data.mandate as { goal_grounding?: string }).goal_grounding as string) ?? "A";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal ?? "");
  const [saving, setSaving] = useState(false);
  // THE MANDATE DOOR — see the note on the Input section's converter run.
  const refine = useHeadlessAgentJson();
  const [refining, setRefining] = useState(false);
  // The TARGET mandate's own served surface — what the goal writer needs told
  // about the job being refined. Never re-derived here (see `refineValues`).
  const targetSurface = useMandateInputSurface(data.mandate.mandate_key);

  const save = async () => {
    if (!draft.trim()) {
      toast.error("The goal cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await patchMandateGoal(dispatch, data.mandate.mandate_key, draft.trim());
      setEditing(false);
      onChanged();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  /**
   * 🚨 WHAT THIS SCREEN HOLDS ABOUT THE MANDATE BEING REFINED, keyed by the
   * GOAL WRITER'S OWN SERVED INPUT NAMES (Arman, live, 2026-08-31).
   *
   * The old call passed `mandate_key` / `mandate_label` / `current_goal` /
   * `description` — four names this screen invented. The goal writer declares
   * `task_overview`, `inputs`, `outputs`, `system_prompt` and
   * `full_agent_object`, so every run was refused: *"required agent value does
   * not exist in the calling code path"*. Names are the SURFACE's to give;
   * `AutomationButton` matches these against what the server actually serves
   * and sends only what that job asked for, so a key it does not serve costs
   * nothing and a key it gains later starts arriving with no deploy.
   *
   * `system_prompt` and `full_agent_object` are deliberately absent: this
   * screen does not read the bound holder's definition, and the surface marks
   * them optional, so the button prints what the run is going without rather
   * than sending an empty string dressed as an answer.
   */
  const refineValues = useMemo(() => {
    /**
     * 🚨 THE TARGET'S INPUTS COME FROM ITS SERVED SURFACE, NOT FROM ONE COLUMN
     * (found by an independent walk of Arman's flow, 2026-08-31).
     *
     * This read `draft_inputs` alone and sent *"This job describes no inputs
     * yet."* for `education.classes_guidance` — a mandate with SEVEN declared
     * inputs printed on the same screen three inches away. The refined goal
     * then opened, correctly and uselessly, with *"there is nothing in your
     * method yet… the rulebook I was handed contains no rules."* The AI was not
     * wrong; it was told the truth about the wrong thing.
     *
     * A mandate can declare inputs FOUR ways — a Provision, the promoted
     * contract columns, its own described inputs, or the bound Holder's
     * variables — and the INPUT section right above renders all four. Reading
     * one of them is the exact defect `input-surface.ts` was written to end:
     * *"NEVER re-derive a surface here."* The served surface is the one thing
     * that knows all four, so it is what gets sent, and when it has not been
     * read the caller says so rather than asserting an absence it never
     * checked — "not read yet" and "declares nothing" must never look alike.
     */
    const servedInputs =
      targetSurface.status === "ready" ? targetSurface.surface.inputs : [];
    const inputsText =
      targetSurface.status === "loading"
        ? "(this job's inputs are still being read)"
        : targetSurface.status === "error"
          ? `(this job's inputs could not be read: ${targetSurface.message})`
          : servedInputs.length > 0
            ? servedInputs
                .map((i) =>
                  [
                    i.label && i.label !== i.name ? `${i.label} (${i.name})` : i.name,
                    i.kind ? `[${i.kind}]` : "",
                    i.sourcing === "require" ? "— required" : "",
                    i.help ? `— ${i.help}` : "",
                  ]
                    .filter(Boolean)
                    .join(" "),
                )
                .join("\n")
            : "This job declares no inputs.";
    const outputs = [
      data.mandate.output_kind
        ? `Output kind: ${data.mandate.output_kind}`
        : "No declared output kind.",
      data.contract.requiredOutputKeys.length > 0
        ? `Required output keys: ${data.contract.requiredOutputKeys.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
    return {
      task_overview: [
        `Job: ${data.mandate.label ?? data.mandate.mandate_key}`,
        `Key: ${data.mandate.mandate_key}`,
        data.mandate.description ? `Description: ${data.mandate.description}` : "",
        `Goal so far: ${goal?.trim() || "(none written yet)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      inputs: inputsText,
      outputs,
    };
  }, [data.mandate, data.contract.requiredOutputKeys, goal, targetSurface]);

  const runRefine = async (variables: Record<string, string>) => {
    setRefining(true);
    try {
      const text = await refine.run<string>({
        mandateKey: GOAL_WRITER_MANDATE_KEY,
        surfaceKey: `mandate:${GOAL_WRITER_MANDATE_KEY}`,
        sourceFeature: "agent-builder",
        expect: "text",
        initiation: "user",
        // The served names, plus whatever the person answered inline. This
        // screen adds nothing of its own — see `refineValues`.
        variables,
      });
      setDraft(text.trim() || (goal ?? ""));
      setEditing(true);
      toast.success("Draft ready — review, then save.");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setRefining(false);
    }
  };

  return (
    <Section title="Goal" hint="lives only here">
      <div className="space-y-2.5 rounded-xl border border-primary/25 bg-card p-4">
        {editing ? (
          <div className="space-y-2">
            <ProTextarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(14, Math.max(5, draft.split("\n").length + 2))}
              className="min-h-32 text-[14px] leading-relaxed"
              autoFocus
              aria-label="Goal"
            />
            <div className="flex items-center gap-1.5">
              <Button size="sm" className="h-7 gap-1 text-[12px]" disabled={saving} onClick={() => void save()}>
                <Check className="h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save goal"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-[12px]"
                onClick={() => {
                  setDraft(goal ?? "");
                  setEditing(false);
                }}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <span className="text-[11px] text-muted-foreground/70">
                Saving marks it human-ratified. Code seeds never overwrite it.
              </span>
            </div>
          </div>
        ) : authoring ? (
          <>
            <button
              type="button"
              className="group w-full rounded-md text-left"
              onClick={() => {
                setDraft(goal ?? "");
                setEditing(true);
              }}
              aria-label="Edit goal"
            >
              <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground">
                {goal || "No goal yet — state exactly what done-well means."}
                <Pencil className="ml-1.5 inline h-3 w-3 align-baseline text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
              </p>
            </button>
            <div className="flex flex-wrap items-center gap-1.5">
              <GroundingBadge grounding={grounding} />
              <AutomationButton
                mandateKey={GOAL_WRITER_MANDATE_KEY}
                label="Refine with AI"
                runningLabel="Refining…"
                running={refining}
                knownValues={refineValues}
                onRun={(variables) => void runRefine(variables)}
              />
            </div>
          </>
        ) : (
          /* Read-only: the goal is a platform definition, changed by an admin
             on the admin route. Stated plainly, never as a disabled control. */
          <>
            <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground">
              {goal || "No goal set for this job yet."}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <GroundingBadge grounding={grounding} />
            </div>
          </>
        )}
        {data.mandate.description && data.mandate.description !== goal ? (
          <p className="border-t border-border/40 pt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            {data.mandate.description}
          </p>
        ) : null}
      </div>
    </Section>
  );
}

// ── OUTPUT ───────────────────────────────────────────────────────────────────

export function TriadOutputSection({ data }: { data: MandateWorkspaceData }) {
  const constraints = outputConstraintsOf(data.mandate);
  return (
    <Section title="Output">
      <div className="space-y-1.5 rounded-xl border border-border/60 bg-card p-4">
        {data.mandate.output_kind ? (
          <EntityRef
            token="shape"
            id={data.mandate.output_kind}
            name={data.mandate.output_kind}
            href={`/shapes/${encodeURIComponent(data.mandate.output_kind)}`}
            showIcon={false}
            className="font-mono text-[12.5px]"
          />
        ) : (
          <p className="text-[12.5px] text-amber-700 dark:text-amber-400">
            No output kind declared
            {data.contract.requiredOutputKeys.length > 0
              ? " — consumers require these keys:"
              : " — unspecified."}
          </p>
        )}
        {data.contract.requiredOutputKeys.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {data.contract.requiredOutputKeys.map((key) => (
              <code key={key} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                {key}
              </code>
            ))}
          </div>
        ) : null}
        {constraints ? (
          <p className="text-[12.5px] text-muted-foreground">{constraints}</p>
        ) : null}
      </div>
    </Section>
  );
}

function outputConstraintsOf(mandate: MandateWorkspaceData["mandate"]): string | null {
  const metadata = (mandate as { metadata?: unknown }).metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).output_constraints;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
