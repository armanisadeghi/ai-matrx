"use client";

/**
 * The scenario editor — authoring a trap an agent cannot guess its way past.
 *
 * A scenario is verification as DATA: pick the mandate, write the facts the
 * agent will be handed, plant markers on the facts that decide the answer,
 * close the route universe, and list what a correct answer must look like.
 * Saving it makes it a runnable proof check with no deploy.
 *
 * The two placeholders are the whole trick, and the editor says so inline:
 *   {{nonce}}         a fresh id per run — makes the fictional site new each time
 *   {{marker:NAME}}   a fresh unguessable token — if it comes back, it was READ
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Info,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { cn } from "@/lib/utils";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";

import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { recordToast, toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { saveScenario } from "@/features/proof-runs/api";
import type {
  Expectation,
  ExpectationRule,
  ExpectationRuleHelp,
  ProofMandateOption,
  ProofScenario,
} from "@/features/proof-runs/types";
import { ProTextarea } from "@/components/official/ProTextarea";
import type { SurfaceScopePayload } from "@ai-matrx/chat/surfaces/types";
import { ADMIN_PROOF_RUNS_SURFACE_NAME } from "@/features/surfaces/manifests/admin-proof-runs.manifest";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { AGENT_ICON } from "@/components/icons/domain-icons";

const MARKER_PATTERN = /\{\{marker:([a-zA-Z0-9_]+)\}\}/g;

/** Every marker NAME the scenario plants, read from its own text. */
function plantedMarkers(scenario: ProofScenario): string[] {
  const haystack = [
    JSON.stringify(scenario.variables ?? {}),
    (scenario.allowed_routes ?? []).join(" "),
    scenario.user_input ?? "",
  ].join(" ");
  const names = new Set<string>();
  for (const match of haystack.matchAll(MARKER_PATTERN)) names.add(match[1]);
  return [...names].sort();
}

function ruleNeeds(rule: ExpectationRule, rules: ExpectationRuleHelp[]) {
  const entry = rules.find((r) => r.rule === rule);
  const needs = entry?.needs ?? [];
  return {
    help: entry?.help ?? "",
    label: entry?.label ?? rule,
    marker: needs.some((n) => n.startsWith("marker")),
    path: needs.some((n) => n.startsWith("path")),
    pathRequired: needs.includes("path"),
    value: needs.some((n) => n.startsWith("value")),
    count: needs.some((n) => n.startsWith("count")),
    rubric: needs.some((n) => n.startsWith("rubric")),
  };
}

function ExpectationRow({
  expectation,
  index,
  rules,
  markers,
  onChange,
  onRemove,
  getApplicationScope,
}: {
  expectation: Expectation;
  index: number;
  rules: ExpectationRuleHelp[];
  markers: string[];
  onChange: (next: Expectation) => void;
  onRemove: () => void;
  getApplicationScope: () => SurfaceScopePayload;
}) {
  const [open, setOpen] = useState(!expectation.id);
  const needs = ruleNeeds(expectation.rule, rules);
  const Chevron = open ? ChevronDown : ChevronRight;
  const isJudge = expectation.rule === "judge";
  const markerMissing =
    needs.marker && expectation.marker && !markers.includes(expectation.marker);

  const set = (patch: Partial<Expectation>) =>
    onChange({ ...expectation, ...patch });

  return (
    <li className="rounded-md border border-border">
      <div className="flex items-start gap-2 p-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-muted-foreground hover:text-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <Chevron className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {expectation.title || expectation.id || `Rule ${index + 1}`}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] font-medium",
                isJudge
                  ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300"
                  : "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
              )}
            >
              {isJudge ? (
                <AGENT_ICON className="h-3 w-3" />
              ) : (
                <Code2 className="h-3 w-3" />
              )}
              {needs.label}
            </span>
            {isJudge ? (
              <IntelligenceIndicator
                feature="proof_runs"
                mandateKeys={[MANDATE_KEYS.proof_runs__judge]}
                label="The judge that answers this rule's rubric when the check runs"
              />
            ) : null}
            {expectation.required === false ? (
              <span className="text-[10px] text-muted-foreground">
                informational
              </span>
            ) : null}
            {markerMissing ? (
              <span className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-3 w-3" />
                nothing plants {expectation.marker}
              </span>
            ) : null}
          </div>
          {expectation.proves ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {expectation.proves}
            </p>
          ) : null}
        </div>
        <Button
          icon={<Trash2 />}
          variant="quiet"
          onClick={onRemove}
          aria-label="Remove rule"
        />
      </div>

      {open ? (
        <div className="space-y-2 border-t border-border p-2">
          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {needs.help}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Rule</Label>
              <Select
                value={expectation.rule}
                onValueChange={(rule) => set({ rule: rule as ExpectationRule })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rules.map((r) => (
                    <SelectItem key={r.rule} value={r.rule} className="text-xs">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Id</Label>
              <Input
                mono
                value={expectation.id}
                onChange={(e) =>
                  set({
                    id: e.target.value
                      .replace(/[^a-z0-9_]/gi, "_")
                      .toLowerCase(),
                  })
                }
                data-identifier
                placeholder="no_fabricated_routes"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Title — what this proof asserts</Label>
            <Input
              value={expectation.title ?? ""}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Every link points at a page that exists"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              Proves — why passing this means the work was done
            </Label>
            <ProTextarea
              surfaceName={ADMIN_PROOF_RUNS_SURFACE_NAME}
              sourceFeature="admin"
              getApplicationScope={getApplicationScope}
              value={expectation.proves ?? ""}
              onChange={(e) => set({ proves: e.target.value })}
              placeholder="The route universe is closed, so any other route is invention."
              className="min-h-[52px] text-xs"
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {needs.marker ? (
              <div className="space-y-1">
                <Label className="text-xs">Marker</Label>
                {markers.length > 0 ? (
                  <Select
                    value={expectation.marker || ""}
                    onValueChange={(marker) => set({ marker })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pick a planted marker" />
                    </SelectTrigger>
                    <SelectContent>
                      {markers.map((name) => (
                        <SelectItem key={name} value={name} className="text-xs">
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Plant one first — put <code>{"{{marker:name}}"}</code> in a
                    variable.
                  </p>
                )}
              </div>
            ) : null}

            {needs.path ? (
              <div className="space-y-1">
                <Label className="text-xs">
                  Path {needs.pathRequired ? "" : "(optional)"}
                </Label>
                <Input
                  mono
                  value={expectation.path ?? ""}
                  onChange={(e) => set({ path: e.target.value })}
                  placeholder="covers"
                />
              </div>
            ) : null}

            {needs.value ? (
              <div className="space-y-1">
                <Label className="text-xs">
                  {expectation.rule === "matches" ? "Pattern" : "Value"}
                </Label>
                <Input
                  mono
                  value={String(expectation.value ?? "")}
                  onChange={(e) => set({ value: e.target.value })}
                />
              </div>
            ) : null}

            {needs.count ? (
              <div className="space-y-1">
                <Label className="text-xs">Count</Label>
                <Input
                  type="number"
                  value={expectation.count ?? 0}
                  onChange={(e) => set({ count: Number(e.target.value) })}
                />
              </div>
            ) : null}
          </div>

          {needs.rubric ? (
            <div className="space-y-1">
              <Label className="text-xs">
                Rubric — the question the judge answers
              </Label>
              <ProTextarea
                surfaceName={ADMIN_PROOF_RUNS_SURFACE_NAME}
                sourceFeature="admin"
                getApplicationScope={getApplicationScope}
                value={expectation.rubric ?? ""}
                onChange={(e) => set({ rubric: e.target.value })}
                placeholder="PASS if the differentiator names a specific subject and contrasts it with a sibling's territory. FAIL if it is generic filler."
                className="min-h-[72px] text-xs"
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              checked={expectation.required !== false}
              onCheckedChange={(required) => set({ required })}
            />
            Required — a failure here fails the whole run
          </label>
        </div>
      ) : null}
    </li>
  );
}

export function ScenarioEditor({
  scenario: initial,
  mandates,
  rules,
  onSaved,
  onCancel,
  getApplicationScope,
  registerScopeReader,
}: {
  scenario: ProofScenario;
  mandates: ProofMandateOption[];
  rules: ExpectationRuleHelp[];
  onSaved: (scenario: ProofScenario) => void;
  onCancel: () => void;
  getApplicationScope: () => SurfaceScopePayload;
  registerScopeReader: (reader: (() => SurfaceScopePayload) | null) => void;
}) {
  const [scenario, setScenario] = useState<ProofScenario>(initial);
  const [variablesText, setVariablesText] = useState(() =>
    JSON.stringify(initial.variables ?? {}, null, 2),
  );
  const [variablesError, setVariablesError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const markers = useMemo(
    () => plantedMarkers({ ...scenario, variables: scenario.variables }),
    [scenario],
  );
  useEffect(() => {
    registerScopeReader(() => ({
      scenario_draft: scenario,
      scenario_editor_state: {
        variables_text: variablesText,
        variables_error: variablesError ?? undefined,
        saving,
        planted_markers: markers,
      },
      scenario_slug: scenario.slug,
      scenario_label: scenario.label,
      scenario_description: scenario.description,
      scenario_mandate_key: scenario.mandate_key,
      scenario_user_input: scenario.user_input ?? undefined,
      scenario_variables: scenario.variables,
      scenario_allowed_routes: scenario.allowed_routes,
      scenario_expectations: scenario.expectations,
      scenario_is_active: scenario.is_active,
      scenario_live_every_seconds: scenario.live_every_seconds,
      scenario_max_cost_usd: scenario.max_cost_usd,
      scenario_check_slug: scenario.check_slug,
      scenario_variables_text: variablesText,
      scenario_variables_error: variablesError ?? undefined,
      scenario_saving: saving,
      scenario_planted_markers: markers,
    }));
    return () => registerScopeReader(null);
  }, [
    scenario,
    variablesText,
    variablesError,
    saving,
    markers,
    registerScopeReader,
  ]);
  const mandate = mandates.find((m) => m.mandate_key === scenario.mandate_key);

  const onVariablesChange = useCallback((text: string) => {
    setVariablesText(text);
    try {
      const parsed: unknown = JSON.parse(text || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setVariablesError("The variables must be a JSON object.");
        return;
      }
      setVariablesError(null);
      setScenario((s) => ({
        ...s,
        variables: parsed as Record<string, unknown>,
      }));
    } catch (err) {
      setVariablesError(extractErrorMessage(err));
    }
  }, []);

  const save = useCallback(async () => {
    if (variablesError) {
      toast.error("Fix the variables JSON before saving");
      return;
    }
    if (!/^[a-z0-9][a-z0-9_]{2,60}$/.test(scenario.slug)) {
      toast.error(
        "The slug must be lowercase letters, numbers and underscores",
      );
      return;
    }
    setSaving(true);
    try {
      const saved = await saveScenario(scenario);
      recordToast.success(
        // A scenario has no separate id — its slug is the stable key and the
        // segment its own route is built from.
        { type: "proof_scenario", id: saved.slug, title: saved.label },
        `Saved ${saved.label}`,
        { description: `Runnable now as ${saved.check_slug}` },
      );
      onSaved(saved);
    } catch (err) {
      toast.error("Could not save the scenario", {
        description: extractErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }, [scenario, variablesError, onSaved]);

  const addExpectation = () =>
    setScenario((s) => ({
      ...s,
      expectations: [
        ...s.expectations,
        {
          id: "",
          rule: "contains_marker",
          title: "",
          proves: "",
          required: true,
        },
      ],
    }));

  const addRoute = () =>
    setScenario((s) => ({ ...s, allowed_routes: [...s.allowed_routes, ""] }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          {initial.slug ? `Editing ${initial.slug}` : "New scenario"}
        </h3>
        <div className="flex items-center gap-2">
          <Button icon={<X />} variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            icon={<Save />}
            variant="primary"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save scenario"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Slug — its permanent id</Label>
          <Input
            mono
            value={scenario.slug}
            onChange={(e) =>
              setScenario((s) => ({
                ...s,
                slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"),
              }))
            }
            data-identifier
            placeholder="family_planted_universe"
            disabled={Boolean(initial.slug)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input
            value={scenario.label}
            onChange={(e) =>
              setScenario((s) => ({ ...s, label: e.target.value }))
            }
            placeholder="Page Family Analyst — planted universe"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">What this scenario traps</Label>
        <ProTextarea
          surfaceName={ADMIN_PROOF_RUNS_SURFACE_NAME}
          sourceFeature="admin"
          getApplicationScope={getApplicationScope}
          value={scenario.description}
          onChange={(e) =>
            setScenario((s) => ({ ...s, description: e.target.value }))
          }
          placeholder="A fictional family with a closed route universe — catches fabricated links and claimed sibling territory."
          className="min-h-[56px] text-xs"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Mandate to test</Label>
        <Select
          value={scenario.mandate_key}
          onValueChange={(mandate_key) =>
            setScenario((s) => ({ ...s, mandate_key }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Pick the job this scenario tests" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {mandates.map((m) => (
              <SelectItem
                key={m.mandate_key}
                value={m.mandate_key}
                className="text-xs"
              >
                {m.label} — {m.mandate_key}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mandate ? (
          <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
            <p className="text-muted-foreground">{mandate.description}</p>
            {mandate.output_kind ? (
              <p className="mt-1 text-muted-foreground">
                Output kind:{" "}
                <code className="font-mono">{mandate.output_kind}</code>
                {mandate.required_output_keys.length > 0 ? (
                  <>
                    {" "}
                    · required keys:{" "}
                    <code className="font-mono">
                      {mandate.required_output_keys.join(", ")}
                    </code>
                  </>
                ) : null}
              </p>
            ) : null}
            {mandate.offered_values.length > 0 ? (
              <div className="mt-2">
                <p className="mb-1 flex items-center gap-1 text-muted-foreground">
                  <Info className="h-3 w-3" />
                  Variables this job&apos;s call site really delivers — click to
                  add:
                </p>
                <div className="flex flex-wrap gap-1">
                  {mandate.offered_values.map((value) => {
                    const present = value.name in (scenario.variables ?? {});
                    return (
                      <button
                        key={value.name}
                        type="button"
                        title={value.description || value.kind}
                        onClick={() => {
                          if (present) return;
                          const next = {
                            ...(scenario.variables ?? {}),
                            [value.name]: "",
                          };
                          setScenario((s) => ({ ...s, variables: next }));
                          setVariablesText(JSON.stringify(next, null, 2));
                        }}
                        className={cn(
                          "rounded-full border px-1.5 py-px font-mono text-[10px]",
                          present
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {present ? (
                          <Check className="mr-0.5 inline h-2.5 w-2.5" />
                        ) : null}
                        {value.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
          The facts the agent is handed (JSON) — plant your markers here
        </Label>
        <p className="text-[11px] text-muted-foreground">
          <code>{"{{nonce}}"}</code> becomes a fresh id each run;{" "}
          <code>{"{{marker:name}}"}</code> becomes a fresh unguessable token. If
          a marker comes back in the answer, the agent READ it — it cannot be
          guessed or remembered.
        </p>
        <ProTextarea
          surfaceName={ADMIN_PROOF_RUNS_SURFACE_NAME}
          sourceFeature="admin"
          getApplicationScope={getApplicationScope}
          className="min-h-[220px] font-mono"
          value={variablesText}
          onChange={(e) => onVariablesChange(e.target.value)}
          spellCheck={false}
        />
        {variablesError ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            {variablesError}
            <ErrorAlchemyMenu error={variablesError} />
          </p>
        ) : null}
        {markers.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Planted markers:{" "}
            {markers.map((m) => (
              <code
                key={m}
                className="mr-1 rounded bg-muted px-1 py-px font-mono"
              >
                {m}
              </code>
            ))}
          </p>
        ) : null}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            The closed universe — every route that EXISTS in this scenario
          </Label>
          <Button icon={<Plus />} variant="outline" onClick={addRoute}>
            Add route
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Anything the answer links to that is not on this list is a
          fabrication, caught by set membership.
        </p>
        <div className="space-y-1">
          {scenario.allowed_routes.map((route, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                mono
                value={route}
                onChange={(e) =>
                  setScenario((s) => {
                    const next = [...s.allowed_routes];
                    next[i] = e.target.value;
                    return { ...s, allowed_routes: next };
                  })
                }
                placeholder="/guides/spindle-calibration-{{nonce}}"
              />
              <Button
                icon={<X />}
                variant="quiet"
                onClick={() =>
                  setScenario((s) => ({
                    ...s,
                    allowed_routes: s.allowed_routes.filter((_, j) => j !== i),
                  }))
                }
                aria-label="Remove route"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label className="text-xs">
            What a correct answer must look like
          </Label>
          <Button icon={<Plus />} variant="outline" onClick={addExpectation}>
            Add rule
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Code rules are free and instant; a judge rule costs money and is
          fallible — reach for a plant first.
        </p>
        <ul className="space-y-1">
          {scenario.expectations.map((expectation, index) => (
            <ExpectationRow
              key={index}
              expectation={expectation}
              getApplicationScope={getApplicationScope}
              index={index}
              rules={rules}
              markers={markers}
              onChange={(next) =>
                setScenario((s) => {
                  const list = [...s.expectations];
                  list[index] = next;
                  return { ...s, expectations: list };
                })
              }
              onRemove={() =>
                setScenario((s) => ({
                  ...s,
                  expectations: s.expectations.filter((_, j) => j !== index),
                }))
              }
            />
          ))}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Live every (hours)</Label>
          <Input
            type="number"
            value={Math.round(scenario.live_every_seconds / 3600)}
            onChange={(e) =>
              setScenario((s) => ({
                ...s,
                live_every_seconds: Math.max(1, Number(e.target.value)) * 3600,
              }))
            }
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Budget per live run ($)</Label>
          <Input
            type="number"
            step="0.05"
            value={scenario.max_cost_usd}
            onChange={(e) =>
              setScenario((s) => ({
                ...s,
                max_cost_usd: Number(e.target.value),
              }))
            }
          />
        </div>
        <label className="flex items-end gap-2 pb-1 text-xs text-muted-foreground">
          <Switch
            checked={scenario.is_active}
            onCheckedChange={(is_active) =>
              setScenario((s) => ({ ...s, is_active }))
            }
          />
          Active
        </label>
      </div>
    </div>
  );
}
