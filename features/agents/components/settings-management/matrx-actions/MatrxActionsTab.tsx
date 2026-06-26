"use client";

/**
 * MatrxActionsTab — define the action this agent performs + how it applies.
 *
 * Two decisions, in the user's mental order:
 *   1. WHAT action does this agent do? — pick from the live registry (built-in
 *      directives + every wired `verb:noun` action in the action catalog).
 *      Picking one wires the agent's `output_schema` to emit that directive
 *      envelope (so the model produces it); the user never thinks about schemas.
 *   2. HOW does it apply? — the apply-policy cascade's agent layer
 *      (`agx_agent.matrx_actions`): Default / Auto-apply / Ask first / Off.
 *
 * The action lives in `output_schema` (canonical envelope path); the policy lives
 * in `matrx_actions`. The retired legacy `directive` raw-output path is surfaced
 * read-only with a Clear.
 */

import { useState } from "react";
import {
  PlayCircle,
  CircleHelp,
  Ban,
  Info,
  Search,
  X,
  Pencil,
  Zap,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentMatrxActions,
  selectAgentOutputSchema,
} from "@/features/agents/redux/agent-definition/selectors";
import {
  setAgentMatrxActions,
  setAgentOutputSchema,
} from "@/features/agents/redux/agent-definition/slice";
import type { MatrxActionsConfig } from "@/features/agents/types/matrx-actions.types";
import { useActionCatalog } from "@/features/action-catalog/hooks/useActionCatalog";
import { buildDirectiveOptions, groupDirectiveOptions } from "./directiveOptions";
import {
  buildActionOutputSchema,
  isActionOutputSchema,
  actionTypeOfSchema,
} from "./actionSchema";

type Policy = "default" | "auto" | "ask" | "off";

function derivePolicy(cfg: MatrxActionsConfig): Policy {
  if (cfg.apply_policy === "auto" || cfg.auto_apply === true || Array.isArray(cfg.allow))
    return "auto";
  if (cfg.apply_policy === "ask") return "ask";
  if (cfg.apply_policy === "off") return "off";
  return "default";
}

/** Preserve the legacy `directive` (if any) across policy edits. */
function policyBase(cfg: MatrxActionsConfig): MatrxActionsConfig {
  return cfg.directive ? { directive: cfg.directive } : {};
}

const POLICY_OPTIONS: {
  id: Policy;
  label: string;
  icon: React.ReactNode;
  hint: string;
}[] = [
  { id: "default", label: "Default", icon: <Info className="h-3.5 w-3.5" />, hint: "Use the system default — ask the user before applying." },
  { id: "auto", label: "Auto-apply", icon: <PlayCircle className="h-3.5 w-3.5" />, hint: "Apply the action automatically, no confirmation." },
  { id: "ask", label: "Ask first", icon: <CircleHelp className="h-3.5 w-3.5" />, hint: "Propose the action; apply only when the user approves." },
  { id: "off", label: "Off", icon: <Ban className="h-3.5 w-3.5" />, hint: "Never apply — the action is inert." },
];

interface MatrxActionsTabProps {
  agentId: string;
}

export function MatrxActionsTab({ agentId }: MatrxActionsTabProps) {
  const dispatch = useAppDispatch();
  const cfg = useAppSelector((state) =>
    selectAgentMatrxActions(state, agentId),
  ) as MatrxActionsConfig;
  const outputSchema = useAppSelector((state) =>
    selectAgentOutputSchema(state, agentId),
  );

  const policy = derivePolicy(cfg);
  const actionType = actionTypeOfSchema(outputSchema);
  const hasCustomSchema = outputSchema != null && !isActionOutputSchema(outputSchema);

  const { catalog, isLoading, error } = useActionCatalog();
  const [query, setQuery] = useState("");
  // Show the picker when no action is set, or when the user clicks "Change".
  const [picking, setPicking] = useState(false);

  const options = buildDirectiveOptions(catalog);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) =>
          o.type.toLowerCase().includes(q) ||
          o.label.toLowerCase().includes(q) ||
          o.family.toLowerCase().includes(q),
      )
    : options;
  const groups = groupDirectiveOptions(filtered);
  const selectedLabel =
    options.find((o) => o.type === actionType)?.label ?? actionType ?? "";

  const setPolicy = (p: Policy) => {
    const b = policyBase(cfg);
    if (p === "default") return dispatch(setAgentMatrxActions({ id: agentId, matrxActions: b }));
    const next: MatrxActionsConfig =
      p === "auto" ? { ...b, apply_policy: "auto" } : { ...b, apply_policy: p };
    dispatch(setAgentMatrxActions({ id: agentId, matrxActions: next }));
  };

  const chooseAction = (type: string) => {
    dispatch(
      setAgentOutputSchema({ id: agentId, outputSchema: buildActionOutputSchema(type) }),
    );
    setPicking(false);
    setQuery("");
  };

  const removeAction = () => {
    // Only clear a schema THIS tab generated — never a custom user schema.
    if (isActionOutputSchema(outputSchema)) {
      dispatch(setAgentOutputSchema({ id: agentId, outputSchema: null }));
    }
    setPicking(false);
  };

  const clearDirective = () => {
    const { directive: _omit, ...rest } = cfg;
    void _omit;
    dispatch(setAgentMatrxActions({ id: agentId, matrxActions: rest }));
  };

  const showPicker = picking || (!actionType && !cfg.directive);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-muted-foreground leading-snug">
        <span className="font-medium text-foreground">Matrx Actions</span> let this
        agent perform an action from its output — create a task or project, write a
        record, and more. Pick the action and choose how it applies; both are saved
        with the agent automatically.
      </p>

      {/* ── 1. The action ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">Action</span>

        {/* Selected action (envelope path) */}
        {actionType && !showPicker && (
          <div className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
            <Zap className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="flex-1 text-xs font-medium text-foreground">
              {selectedLabel}
            </span>
            <code className="font-mono text-[10px] text-muted-foreground">{actionType}</code>
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Pencil className="h-3 w-3" /> Change
            </button>
            <button
              type="button"
              onClick={removeAction}
              className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          </div>
        )}

        {/* Registry picker */}
        {showPicker && (
          <div className="flex flex-col gap-2">
            {hasCustomSchema && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                This agent already has a custom Output Schema. Choosing an action
                will replace it with the action&apos;s envelope.
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search actions…"
                  className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              {actionType && (
                <button
                  type="button"
                  onClick={() => { setPicking(false); setQuery(""); }}
                  className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
              )}
            </div>

            {error ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                Couldn&apos;t load the live action catalog ({error}). Built-in
                actions are still available below.
              </div>
            ) : null}

            {isLoading && !catalog ? (
              <div className="flex flex-col gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-7 animate-pulse rounded bg-muted/60" />
                ))}
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto rounded-md border border-border">
                {groups.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No actions match &ldquo;{query}&rdquo;.
                  </div>
                ) : (
                  groups.map((group) => (
                    <div key={group.family}>
                      <div className="sticky top-0 bg-muted/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                        {group.family}
                      </div>
                      {group.options.map((opt) => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => chooseAction(opt.type)}
                          className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent ${
                            opt.type === actionType ? "bg-primary/5" : ""
                          }`}
                        >
                          <span className="flex-1 text-foreground">{opt.label}</span>
                          <code className="font-mono text-[10px] text-muted-foreground">
                            {opt.type}
                          </code>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Picking an action sets up the agent&apos;s output to emit it. The
              agent&apos;s instructions should tell it when to produce the action.
            </p>
          </div>
        )}

        {/* Legacy declared-directive — read-only */}
        {cfg.directive && !actionType && (
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 leading-snug text-muted-foreground">
              Legacy declared-directive:{" "}
              <code className="font-mono text-foreground">{cfg.directive}</code>. Pick
              an action above to move it onto the modern path.
            </div>
            <button
              type="button"
              onClick={clearDirective}
              className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── 2. The policy ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <span className="text-xs font-semibold text-foreground">How it applies</span>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {POLICY_OPTIONS.map((opt) => {
            const active = policy === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPolicy(opt.id)}
                title={opt.hint}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {opt.icon}
                {opt.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {POLICY_OPTIONS.find((o) => o.id === policy)?.hint}
        </p>
      </div>
    </div>
  );
}
