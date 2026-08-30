"use client";

// features/agents/mandates/workspace/TriadSections.tsx
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

import { useState } from "react";
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
import { useMandateRunner } from "../useMandateRunner";
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
}: {
  data: MandateWorkspaceData;
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const draftInputs = parseDraftInputs(
    (data.mandate as { draft_inputs?: unknown }).draft_inputs,
  );
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftInput[]>(draftInputs);
  const [saving, setSaving] = useState(false);
  const convert = useMandateRunner(KIND_CONVERTER_MANDATE_KEY);
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

  const runConvert = async () => {
    setConverting(true);
    try {
      const text = await convert.runMandate({
        variables: {
          mandate_key: data.mandate.mandate_key,
          mandate_goal: goalOfMandate(data.mandate) ?? "",
          draft_inputs: JSON.stringify(draftInputs),
        },
        sourceApp: "matrx-frontend",
        sourceFeature: "agent-builder",
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
          <p className="text-[13px] text-muted-foreground">
            User text only — nothing declared, nothing offered.
          </p>
        )}

        {!data.offer && !editing ? (
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
                onRun={() => void runConvert()}
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
}: {
  data: MandateWorkspaceData;
  onChanged: () => void;
}) {
  const dispatch = useAppDispatch();
  const goal = goalOfMandate(data.mandate);
  const grounding =
    ((data.mandate as { goal_grounding?: string }).goal_grounding as string) ?? "A";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal ?? "");
  const [saving, setSaving] = useState(false);
  const refine = useMandateRunner(GOAL_WRITER_MANDATE_KEY);
  const [refining, setRefining] = useState(false);

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

  const runRefine = async () => {
    setRefining(true);
    try {
      const text = await refine.runMandate({
        variables: {
          mandate_key: data.mandate.mandate_key,
          mandate_label: data.mandate.label,
          current_goal: goal ?? "",
          description: data.mandate.description ?? "",
        },
        sourceApp: "matrx-frontend",
        sourceFeature: "agent-builder",
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
        ) : (
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
                onRun={() => void runRefine()}
              />
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
