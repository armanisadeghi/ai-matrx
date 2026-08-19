"use client";

// features/masterwork/components/add-rule/AddRulePanel.tsx
//
// The chrome-less "add a rule" experience — the body of the Add-rule
// WindowPanel (Arman, 2026-08-17: "I hate these blocking freaking modals…
// look at [the project-new] window panel and you understand how everything in
// our system should run"), modeled on ProjectCreatePanel's two-mode split:
//
//   - "With AI" (THE DEFAULT): the Expert describes the rule in their own
//     words (ProTextarea — talk, don't type: "we don't want to be the system
//     where you ever have to type a single word if you don't want to"), the
//     `masterwork.rule_improver` Mandate drafts the full structured rule with
//     the whole Rulebook as context, and the draft is reviewed before it
//     lands — always as a DRAFT rule awaiting the explicit Approve.
//   - "Manually": the canonical RuleFields form. A hand-authored rule lands
//     live (the Expert typing it IS the human-first act).
//
// Both lanes write through the ONE canonical CAS path (upsertRuleWithRetry →
// saveRules) — never a second write path.

import { useCallback, useEffect, useState } from "react";
import { Keyboard, Plus, Sparkles, Wand2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import { LiveRunDisplay } from "@/features/agents/components/live-run/LiveRunDisplay";
import type { RuleImproveResult } from "../../agent-context/ruleImprove";
import { RuleDecisionActions } from "../../review/RuleDecisionActions";
import { useRuleImproveRun } from "../../review/useRuleImproveRun";
import { nextRuleId } from "../../ruleIds";
import { getRulebook, upsertRuleWithRetry } from "../../service";
import type { Rulebook, RulebookRule } from "../../types";
import { SEVERITY_LABELS } from "../../types";
import { RuleFields, type RuleFieldValues } from "../detail/RuleFields";

export interface AddRulePanelProps {
  rulebookId: string;
  /** Pre-select a section (the "Add here" entry point). */
  defaultSection?: string | null;
  /** Fired after a rule lands (either lane) with the fresh Rulebook. */
  onAdded: (rule: RulebookRule, rulebook: Rulebook) => void;
}

type Mode = "ai" | "manual";

const EMPTY_FIELDS = (section: string): RuleFieldValues => ({
  name: "",
  statement: "",
  rationale: "",
  detection: "",
  quote: "",
  severity: "major",
  section,
});

export function AddRulePanel({
  rulebookId,
  defaultSection,
  onAdded,
}: AddRulePanelProps) {
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // AI first — the default tab, per the ruling.
  const [mode, setMode] = useState<Mode>("ai");
  const [describe, setDescribe] = useState("");
  const [aiDraft, setAiDraft] = useState<RuleImproveResult | null>(null);
  const [fields, setFields] = useState<RuleFieldValues>(
    EMPTY_FIELDS(defaultSection ?? "G"),
  );
  const [saving, setSaving] = useState(false);
  // The IMPROVE verb on the AI draft: the Expert says what should change and
  // the SAME Mandate rewrites it — never a second improve path.
  const [refining, setRefining] = useState(false);
  const [refineInput, setRefineInput] = useState("");
  const draftRun = useRuleImproveRun({
    rulebookId,
    organizationId: rulebook?.organization_id ?? "",
    sections: rulebook?.sections ?? {},
  });

  useEffect(() => {
    let cancelled = false;
    void getRulebook(rulebookId)
      .then((r) => {
        if (cancelled) return;
        if (!r) {
          setLoadError(
            "This Rulebook doesn't exist, or you don't have access to it.",
          );
          return;
        }
        setRulebook(r);
        setFields((prev) => ({
          ...prev,
          section:
            defaultSection && Object.hasOwn(r.sections, defaultSection)
              ? defaultSection
              : Object.hasOwn(r.sections, prev.section)
                ? prev.section
                : (Object.keys(r.sections)[0] ?? "G"),
        }));
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : "Could not load the Rulebook",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [rulebookId, defaultSection]);

  const landRule = useCallback(
    async (values: RuleFieldValues, opts: { draft: boolean; note?: string }) => {
      if (!rulebook) return;
      if (!values.name.trim() || !values.statement.trim()) {
        toast.error("A rule needs at least a short name and the rule itself.");
        return;
      }
      setSaving(true);
      try {
        // Fresh ids against the freshest rules we have; the CAS retry inside
        // upsertRuleWithRetry re-reads anyway, and appends are commutative.
        const existingIds = new Set(rulebook.rules.map((r) => r.id));
        const rule: RulebookRule = {
          id: nextRuleId(values.name.trim(), existingIds),
          name: values.name.trim(),
          statement: values.statement.trim(),
          rationale: values.rationale.trim() || undefined,
          detection: values.detection.trim() || undefined,
          quote: values.quote.trim() || undefined,
          severity: values.severity,
          section: values.section,
          ...(opts.draft ? { draft: true } : {}),
          ...(opts.note ? { source_ref: { note: opts.note } } : {}),
        };
        const saved = await upsertRuleWithRetry({ rulebookId, rule });
        setRulebook(saved);
        toast.success(
          opts.draft
            ? `"${rule.name}" added as a draft — approve it in review`
            : `"${rule.name}" added`,
        );
        onAdded(rule, saved);
        // Stay open for the next rule — reset both lanes.
        setDescribe("");
        setAiDraft(null);
        setRefining(false);
        setRefineInput("");
        draftRun.dismiss();
        setFields(EMPTY_FIELDS(values.section));
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not save the rule",
        );
      } finally {
        setSaving(false);
      }
    },
    [rulebook, rulebookId, onAdded, draftRun],
  );

  const rulebookContext = (book: Rulebook) => ({
    name: book.name,
    description: book.description,
    sections: book.sections,
    rules: book.rules,
  });

  const draftWithAi = async () => {
    if (!rulebook || !describe.trim()) return;
    const fallbackSection =
      defaultSection && Object.hasOwn(rulebook.sections, defaultSection)
        ? defaultSection
        : (Object.keys(rulebook.sections)[0] ?? "G");
    try {
      const result = await draftRun.run<RuleImproveResult>({
        surfaceKey: "masterwork-add-rule",
        fields: null,
        expertInput: describe.trim(),
        context: rulebookContext(rulebook),
        fallbackSection,
        apply: (value) => value,
        failureMessages: {
          timeout: "Drafting took too long. Your words are still here.",
        },
      });
      setAiDraft(result);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not draft the rule",
      );
    }
  };

  // IMPROVE, before the rule has ever been saved: the same
  // `masterwork.rule_improver` Mandate, now with the draft as `rule_json` and
  // the Expert's guidance as `expert_input`. The result replaces the draft
  // in place — it still lands only through the explicit "Add as a draft".
  const improveDraft = async () => {
    if (!rulebook || !aiDraft || !refineInput.trim()) return;
    try {
      const result = await draftRun.run<RuleImproveResult>({
        surfaceKey: "masterwork-add-rule-improve",
        fields: aiDraft,
        expertInput: refineInput.trim(),
        context: rulebookContext(rulebook),
        fallbackSection: aiDraft.section,
        apply: (value) => value,
        failureMessages: {
          timeout: "The rewrite took too long. Your draft is unchanged.",
        },
      });
      setAiDraft(result);
      setRefineInput("");
      setRefining(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not improve the rule",
      );
    }
  };

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">{loadError}</p>
      </div>
    );
  }
  if (!rulebook) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  const sectionLabel = (code: string) =>
    rulebook.sections[code]?.label ?? code;

  return (
    // "Talk, don't type" is this panel's whole premise, so what the Expert says
    // here is Rulebook material and gets stamped as such.
    <MasterworkDictationOrigin
      surface="masterwork.add_rule"
      rulebookId={rulebookId}
      rulebookName={rulebook.name}
    >
    <div className="flex h-full min-h-0 flex-col">
      {/* Mode switcher — two mutually-exclusive entry methods. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-4 py-2">
        <Button
          size="sm"
          variant={mode === "ai" ? "secondary" : "ghost"}
          className="h-7"
          onClick={() => setMode("ai")}
        >
          <Sparkles className="h-3.5 w-3.5" />
          With AI
        </Button>
        <Button
          size="sm"
          variant={mode === "manual" ? "secondary" : "ghost"}
          className="h-7"
          onClick={() => setMode("manual")}
        >
          <Keyboard className="h-3.5 w-3.5" />
          Manually
        </Button>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {rulebook.name}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mode === "ai" ? (
          <div className="space-y-4">
            {!aiDraft ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Say the rule the way you&apos;d tell a new hire — talk or
                  type. We turn your words into a complete rule that fits this
                  Rulebook, and nothing is final until you approve it.
                </p>
                <ProTextarea
                  value={describe}
                  onChange={(e) => setDescribe(e.target.value)}
                  placeholder="Describe the rule in your own words…"
                  autoGrow
                  minHeight={140}
                  maxHeight={320}
                  disabled={draftRun.isRunning}
                />
                {draftRun.hasLiveRun ? (
                  <LiveRunDisplay
                    conversationId={draftRun.conversationId}
                    pending={draftRun.isRunning}
                    label="Drafting your rule"
                    onDismiss={draftRun.dismiss}
                    bodyClassName="max-h-40"
                  />
                ) : null}
                <div className="flex justify-end">
                  <Button
                    onClick={() => void draftWithAi()}
                    disabled={draftRun.isRunning || !describe.trim()}
                  >
                    <Wand2 className="h-4 w-4" />
                    {draftRun.isRunning ? "Drafting…" : "Draft the rule"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                {draftRun.hasLiveRun ? (
                  <LiveRunDisplay
                    conversationId={draftRun.conversationId}
                    pending={draftRun.isRunning}
                    label="Rewriting your rule"
                    onDismiss={draftRun.dismiss}
                    bodyClassName="max-h-40"
                  />
                ) : null}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {aiDraft.name}
                    </span>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {SEVERITY_LABELS[aiDraft.severity]}
                    </Badge>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                      {sectionLabel(aiDraft.section)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-foreground">
                    {aiDraft.statement}
                  </p>
                  {aiDraft.rationale ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      <span className="font-medium text-foreground">
                        Why it matters:{" "}
                      </span>
                      {aiDraft.rationale}
                    </p>
                  ) : null}
                  {aiDraft.detection ? (
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      <span className="font-medium text-foreground">
                        How to spot a violation:{" "}
                      </span>
                      {aiDraft.detection}
                    </p>
                  ) : null}
                </div>
                {refining ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                    <p className="text-sm font-medium text-foreground">
                      What should change?
                    </p>
                    <ProTextarea
                      value={refineInput}
                      onChange={(e) => setRefineInput(e.target.value)}
                      placeholder="Talk or type — we rewrite the draft to match…"
                      autoGrow
                      minHeight={90}
                      maxHeight={240}
                      disabled={draftRun.isRunning}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        disabled={draftRun.isRunning}
                        onClick={() => {
                          setRefining(false);
                          setRefineInput("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void improveDraft()}
                        disabled={draftRun.isRunning || !refineInput.trim()}
                      >
                        <Wand2 className="h-4 w-4" />
                        {draftRun.isRunning ? "Rewriting…" : "Rewrite it"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* The four verbs — the ONE shared contract
                     (features/masterwork/review/RuleDecisionActions). */
                  <RuleDecisionActions
                    className="justify-end"
                    disabled={saving || draftRun.isRunning}
                    labels={{
                      approve: saving ? "Adding…" : "Add as a draft",
                      reject: "Start over",
                      edit: "Edit before adding",
                    }}
                    onApprove={() =>
                      void landRule(
                        {
                          name: aiDraft.name,
                          statement: aiDraft.statement,
                          rationale: aiDraft.rationale,
                          detection: aiDraft.detection,
                          quote: "",
                          severity: aiDraft.severity,
                          section: aiDraft.section,
                        },
                        {
                          draft: true,
                          note: "Drafted by AI from your description",
                        },
                      )
                    }
                    onImprove={() => setRefining(true)}
                    onReject={() => {
                      setAiDraft(null);
                      setRefineInput("");
                      setRefining(false);
                      draftRun.dismiss();
                    }}
                    onEdit={() => {
                      setFields({
                        name: aiDraft.name,
                        statement: aiDraft.statement,
                        rationale: aiDraft.rationale,
                        detection: aiDraft.detection,
                        quote: "",
                        severity: aiDraft.severity,
                        section: aiDraft.section,
                      });
                      setMode("manual");
                    }}
                  />
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <RuleFields
              values={fields}
              onChange={(patch) =>
                setFields((prev) => ({ ...prev, ...patch }))
              }
              sections={rulebook.sections}
              idPrefix="add-rule"
              autoFocusName={false}
            />
            <div className="flex justify-end">
              <Button
                disabled={saving}
                onClick={() => void landRule(fields, { draft: false })}
              >
                <Plus className="h-4 w-4" />
                {saving ? "Adding…" : "Add rule"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
    </MasterworkDictationOrigin>
  );
}
