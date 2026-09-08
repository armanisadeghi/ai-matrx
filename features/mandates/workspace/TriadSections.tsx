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
import { ArrowDown, Check, Pencil, X } from "lucide-react";
import {
  FieldHelp,
  PropertyRow,
  StatusToken,
} from "@/components/official/ConfigurationFields";
import { displayLabelForKey } from "@/features/agents/utils/variable-utils";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { ServerNotes } from "@/components/official/ServerNotes";
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
import { useMandate } from "../useMandate";
import { useOpenAgentRunWindow } from "@/features/overlays/openers/agentRunWindow";
import {
  useSurfaceScopeContribution,
  useSurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  MANDATE_WORKSPACE_SURFACE_NAME,
  MANDATE_WORKSPACE_WRITE_TARGETS,
  type createMandateWorkspaceScope,
} from "@/features/surfaces/manifests/mandate-workspace.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/** The goal editor's fragment of the workspace scope — every key typed against
 * the manifest helper, minus the provider-owned `mandate_key`. */
function goalSectionScope(
  values: Omit<
    Parameters<typeof createMandateWorkspaceScope>[0],
    "mandate_key"
  >,
): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
import { MandateUserTextLine } from "../components/MandateUserTextLine";
import { Section } from "./Section";
import type { MandateWorkspaceData } from "./useMandateWorkspaceData";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toastFailure } from "@/lib/failure/toastFailure";

/** Plain words for H/V/A — never the letter alone. */
export function GroundingBadge({ grounding }: { grounding: string | null }) {
  const label =
    grounding === "H"
      ? "Human-ratified"
      : grounding === "V"
        ? "Verified"
        : grounding === "A"
          ? "Agent-written"
          : "Unknown";
  return (
    <PropertyRow
      label="Goal authority"
      value={label}
      source="Mandate definition"
    />
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
      toastFailure(error, {
        action: "saving these inputs",
        retrySafe: true,
        fallback: "Save failed.",
        retry: () => void save(),
      });
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
        .map((i) =>
          [i.description, i.name ? `(${i.name})` : ""]
            .filter(Boolean)
            .join(" "),
        )
        .join("\n"),
      draft_inputs: JSON.stringify(draftInputs),
    }),
    [data.mandate, draftInputs],
  );

  const runConvert = async (variables: Record<string, string>) => {
    setConverting(true);
    try {
      // The product is a STRUCTURE (draft-input rows), so it is read as the
      // extracted object — never as answer text re-parsed by hand (the
      // flattening class `structured-output-flattening.ts` screams about).
      const proposal = await convert.run<unknown>({
        mandateKey: KIND_CONVERTER_MANDATE_KEY,
        surfaceKey: `mandate:${KIND_CONVERTER_MANDATE_KEY}`,
        sourceFeature: "agent-builder",
        expect: "json",
        initiation: "user",
        // Served names only — see `convertValues`.
        variables,
      });
      toast.success("Structure proposal ready — review below.");
      setDraft(applyConversion(draftInputs, proposal));
      setEditing(true);
    } catch (error: unknown) {
      toastFailure(error, {
        action: "asking for a structure proposal",
        retrySafe: true,
        fallback: "The proposal could not be produced.",
        retry: () => void runConvert(variables),
      });
    } finally {
      setConverting(false);
    }
  };

  return (
    <Section title="Inputs">
      <div className="space-y-2 rounded-xl border border-border/60 bg-card p-4">
        <PropertyRow
          label="Declaration source"
          value={
            data.offer
              ? "Provision"
              : draftInputs.length > 0
                ? "Mandate draft"
                : data.contract.requiredVariables.length > 0
                  ? "Mandate contract"
                  : "Served input surface"
          }
        />
        {data.offer ? (
          <ProvisionOfferList
            values={data.offer.values}
            pinnedContext={data.pinnedContext}
          />
        ) : editing ? (
          <div className="space-y-2">
            <DraftInputsEditor items={draft} onChange={setDraft} />
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                className="h-7 gap-1 text-[12px]"
                disabled={saving}
                onClick={() => void save()}
              >
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
          <ul className="divide-y divide-border/40">
            {draftInputs.map((item, index) => (
              <li key={index} className="py-2">
                <PropertyRow
                  label="Input"
                  value={
                    item.name
                      ? displayLabelForKey(item.name)
                      : "Display name missing"
                  }
                  help={item.description || "No description provided."}
                />
                <PropertyRow
                  label="Format"
                  value={
                    item.kind ? displayLabelForKey(item.kind) : "Not specified"
                  }
                />
                <PropertyRow label="Always available" value="Unknown" />
                <PropertyRow label="Retrieval" value="Unknown" />
                <PropertyRow
                  label="Automatic context delivery"
                  value="Unknown"
                />
                <PropertyRow
                  label="Example"
                  value={item.example || "Not provided"}
                />
              </li>
            ))}
          </ul>
        ) : data.contract.requiredVariables.length > 0 ? (
          <div className="divide-y divide-border/40">
            {data.contract.requiredVariables.map((name) => (
              <div key={name} className="py-2">
                <PropertyRow label="Input" value={displayLabelForKey(name)} />
                <PropertyRow label="Required" value="Yes" />
                <PropertyRow label="Format" value="Not specified" />
                <PropertyRow label="Always available" value="Unknown" />
                <PropertyRow label="Retrieval" value="Unknown" />
                <PropertyRow
                  label="Automatic context delivery"
                  value="Unknown"
                />
                <PropertyRow label="Example" value="Not provided" />
              </div>
            ))}
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
                setDraft(
                  draftInputs.length > 0 ? draftInputs : [{ description: "" }],
                );
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

        {/* 🚨 ONE SENTENCE, ONE AUTHORITY — see MandateUserTextLine. This was
            a hardcoded claim that free text was always accepted, while the
            admin panel said the opposite about the same mandate. */}
        <MandateUserTextLine
          mandateKey={data.mandate.mandate_key}
          className="border-t border-border/40 pt-2 text-[11.5px] text-muted-foreground/80"
        />
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
      <div aria-label="Reading input declarations">
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <PropertyRow
        label="Input declarations"
        value={<StatusToken status="unknown" label="Unavailable" />}
        help={state.message}
      />
    );
  }
  const { surface } = state;
  if (isUserTextOnly(surface)) {
    return (
      <PropertyRow
        label="Declared inputs"
        value="None"
        source="Served input surface"
      />
    );
  }
  return (
    <div className="space-y-1.5">
      <PropertyRow
        label="Declared by"
        value={surface.holderName || "Holder name unavailable"}
      />
      <PropertyRow label="Declared inputs" value={surface.inputs.length} />
      {surface.inputs.map((input) => (
        <div key={input.name} className="border-t border-border/40 py-2">
          <PropertyRow
            label="Input"
            value={displayLabelForKey(input.name, input.label)}
            help={input.help || "No description provided."}
          />
          <PropertyRow label="Format" value={displayLabelForKey(input.kind)} />
          <PropertyRow label="Required" value={input.required ? "Yes" : "No"} />
          <PropertyRow label="Always available" value="Unknown" />
          <PropertyRow label="Retrieval" value="Unknown" />
          <PropertyRow label="Automatic context delivery" value="Unknown" />
          <PropertyRow
            label="Example"
            value={input.example || "Not provided"}
          />
        </div>
      ))}
      <ServerNotes
        heading="Input declaration issues"
        notes={surface.notes}
        testId="holder-inputs-notes"
      />
    </div>
  );
}

/** Best-effort: a conversion result shaped as draft-input rows (an array, or
 * an object carrying `draft_inputs`) replaces the rows; anything else keeps
 * the rows untouched. */
function applyConversion(current: DraftInput[], output: unknown): DraftInput[] {
  try {
    const parsed: unknown =
      typeof output === "string" ? JSON.parse(output) : output;
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
    typeof data.mandate.goal_grounding === "string"
      ? data.mandate.goal_grounding
      : "Unknown";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal ?? "");
  const [saving, setSaving] = useState(false);
  /**
   * 🚨 THE GOAL WRITER IS A CONVERSATION, NOT A STRING (Arman, 2026-09-08).
   *
   * This used to run `mandate.goal_writer` headless with `expect: "text"` and
   * paste whatever came back into the textarea. The job's product is an
   * `agent_mandate_specification` — a registered shape with a role, an
   * objective, weighted criteria, constraints, failure modes, a compressed
   * CHARGE and clarifying QUESTIONS, and a component that renders all of it —
   * and the job is designed for back-and-forth before anything is final. A
   * headless text run threw every part away, rendered JSON by hand, and made
   * the conversation impossible. The system said nothing (it screams now:
   * `structured-output-flattening.ts`).
   *
   * So the button opens THE agent run window ON THE MANDATE (`mandateKey` —
   * the server resolves the Holder; the resolved agent id below only paints
   * the chrome) with the served variables seeded and the run started. The
   * transcript renders through the ONE pipeline, the person keeps talking,
   * and the shape's own "Use as goal" control — or the writer itself, through
   * this surface's `mandate_goal_draft` write target — stages the charge into
   * the editor below. Nothing here parses model output.
   */
  const writer = useMandate(GOAL_WRITER_MANDATE_KEY);
  const openRun = useOpenAgentRunWindow();
  // The TARGET mandate's own served surface — what the goal writer needs told
  // about the job being refined. Never re-derived here (see `refineValues`).
  const targetSurface = useMandateInputSurface(data.mandate.mandate_key);

  // ── THE SURFACE HALF: this section IS the goal editor, so it publishes the
  // goal values and owns the ONE write target (`mandate_goal_draft`). Only on
  // the admin route — everywhere else the goal is read-only and a target
  // nothing can land in would be a declared lie.
  const surfaceName = authoring ? MANDATE_WORKSPACE_SURFACE_NAME : null;
  // `mandate_key` is the PROVIDER's (AdminMandateWorkspacePage owns identity);
  // a descendant may never re-emit a provider-owned value.
  useSurfaceScopeContribution(surfaceName, "TriadGoalSection", () =>
    goalSectionScope({
      ...(data.mandate.label ? { mandate_label: data.mandate.label } : {}),
      ...(data.mandate.description
        ? { mandate_description: data.mandate.description }
        : {}),
      mandate_goal: goal ?? "",
      mandate_goal_grounding: grounding,
      ...(data.mandate.output_kind
        ? { mandate_output_kind: data.mandate.output_kind }
        : {}),
      mandate_goal_draft: { editing, text: editing ? draft : (goal ?? "") },
    }),
  );
  useSurfaceWriteHandlers(surfaceName, {
    [MANDATE_WORKSPACE_WRITE_TARGETS.goalDraft]: (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(
          "mandate_goal_draft takes a non-empty STRING — the goal text itself (a writer's `charge`), never an object or the whole specification.",
        );
      }
      setDraft(value.trim());
      setEditing(true);
    },
  });

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
      toastFailure(error, {
        action: "saving this goal",
        retrySafe: true,
        fallback: "Save failed.",
        retry: () => void save(),
      });
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
                    i.label && i.label !== i.name
                      ? `${i.label} (${i.name})`
                      : i.name,
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
        data.mandate.description
          ? `Description: ${data.mandate.description}`
          : "",
        `Goal so far: ${goal?.trim() || "(none written yet)"}`,
      ]
        .filter(Boolean)
        .join("\n"),
      inputs: inputsText,
      outputs,
    };
  }, [data.mandate, data.contract.requiredOutputKeys, goal, targetSurface]);

  const runRefine = (variables: Record<string, string>) => {
    // `AutomationButton` only enables once the door resolved the job, so a
    // null holder here is a race, not a state — say so rather than open a
    // window on nothing.
    if (!writer.mandate) {
      toast.error(
        writer.error ??
          `The job "${GOAL_WRITER_MANDATE_KEY}" has not resolved yet — try again in a moment.`,
      );
      return;
    }
    openRun({
      // ONE window per mandate being refined: a second press re-binds it
      // instead of stacking a new one over the page.
      instanceId: `goal-writer:${data.mandate.mandate_key}`,
      initialAgentId: writer.mandate.agentId,
      initialAgentName: "Goal Writer",
      mandateKey: GOAL_WRITER_MANDATE_KEY,
      // The run is ABOUT this page: it reads the goal as saved and is offered
      // `mandate_goal_draft`, so "apply that as the goal" works in the chat.
      surfaceName: MANDATE_WORKSPACE_SURFACE_NAME,
      // The served names, plus whatever the person answered inline. This
      // screen adds nothing of its own — see `refineValues`.
      initialVariableValues: variables,
      initialAutoRun: true,
    });
  };

  return (
    <Section title="Goal">
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
              <Button
                size="sm"
                className="h-7 gap-1 text-[12px]"
                disabled={saving}
                onClick={() => void save()}
              >
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
              <FieldHelp label="Save goal">
                Saving marks the goal as human-ratified. Code seeds do not
                overwrite it.
              </FieldHelp>
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
                {goal || "Not specified"}
                <Pencil className="ml-1.5 inline h-3 w-3 align-baseline text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
              </p>
            </button>
            <div className="space-y-2">
              <GroundingBadge grounding={grounding} />
              <AutomationButton
                mandateKey={GOAL_WRITER_MANDATE_KEY}
                label="Refine with AI"
                runningLabel="Opening…"
                running={false}
                knownValues={refineValues}
                onRun={(variables) => runRefine(variables)}
              />
            </div>
          </>
        ) : (
          /* Read-only: the goal is a platform definition, changed by an admin
             on the admin route. Stated plainly, never as a disabled control. */
          <>
            <p className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-foreground">
              {goal || "Not specified"}
            </p>
            <div className="space-y-2">
              <GroundingBadge grounding={grounding} />
            </div>
          </>
        )}
        <PropertyRow
          label="Description"
          value={data.mandate.description ? "Provided" : "Not provided"}
          help={data.mandate.description || undefined}
          className="border-t border-border/40 pt-2"
        />
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
        <PropertyRow
          label="Format"
          value={
            data.mandate.output_kind ? (
              <EntityRef
                token="shape"
                id={data.mandate.output_kind}
                name={displayLabelForKey(data.mandate.output_kind)}
                href={`/shapes/${encodeURIComponent(data.mandate.output_kind)}`}
                showIcon={false}
                wrap
              />
            ) : (
              "Not specified"
            )
          }
          source="Mandate definition"
        />
        <PropertyRow
          label="Required fields"
          value={
            data.contract.requiredOutputKeys.length > 0
              ? data.contract.requiredOutputKeys
                  .map((key) => displayLabelForKey(key))
                  .join(", ")
              : "None declared"
          }
          source="Mandate contract"
        />
        <PropertyRow
          label="Constraints"
          value={
            <span className="whitespace-pre-wrap">
              {constraints || "Not specified"}
            </span>
          }
          source="Mandate definition"
        />
      </div>
    </Section>
  );
}

function outputConstraintsOf(
  mandate: MandateWorkspaceData["mandate"],
): string | null {
  const metadata = (mandate as { metadata?: unknown }).metadata;
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).output_constraints;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
