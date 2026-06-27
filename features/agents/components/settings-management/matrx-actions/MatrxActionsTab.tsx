"use client";

/**
 * MatrxActionsTab — the actions this agent can perform + how they apply.
 *
 * An agent may list MANY actions (no cap): canonical `verb:noun` actions from the
 * live action catalog, named built-in directives, AND custom free-form types.
 * The list is stored in `matrx_actions.actions`; the apply policy in
 * `matrx_actions.apply_policy`.
 *
 * IMPORTANT: this tab NEVER edits the agent's authored system prompt. Structure
 * guidance for these actions is injected at RUNTIME by the system-prompt builder
 * (`SystemInstruction.action_types` → "## Available Matrx Actions") — preview
 * exactly what the model receives via "Preview full prompt".
 */

import { useState } from "react";
import { PlayCircle, CircleHelp, Ban, Info, Search, X, Plus, Check } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentMatrxActions } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentMatrxActions } from "@/features/agents/redux/agent-definition/slice";
import type { MatrxActionsConfig } from "@/features/agents/types/matrx-actions.types";
import { useActionCatalog } from "@/features/action-catalog/hooks/useActionCatalog";
import { buildDirectiveOptions, groupDirectiveOptions } from "./directiveOptions";

type Policy = "default" | "auto" | "ask" | "off";

function derivePolicy(cfg: MatrxActionsConfig): Policy {
  if (cfg.apply_policy === "auto" || cfg.auto_apply === true) return "auto";
  if (cfg.apply_policy === "ask") return "ask";
  if (cfg.apply_policy === "off") return "off";
  return "default";
}

/** The agent's action list — `actions`, with back-compat for legacy shapes. */
function deriveActions(cfg: MatrxActionsConfig): string[] {
  if (Array.isArray(cfg.actions)) return cfg.actions;
  if (Array.isArray(cfg.allow)) return cfg.allow;
  if (cfg.directive) return [cfg.directive];
  return [];
}

const POLICY_OPTIONS: {
  id: Policy;
  label: string;
  icon: React.ReactNode;
  hint: string;
}[] = [
  { id: "default", label: "Default", icon: <Info className="h-3.5 w-3.5" />, hint: "Use the system default — ask the user before applying." },
  { id: "auto", label: "Auto-apply", icon: <PlayCircle className="h-3.5 w-3.5" />, hint: "Apply the agent's actions automatically, no confirmation." },
  { id: "ask", label: "Ask first", icon: <CircleHelp className="h-3.5 w-3.5" />, hint: "Propose each action; apply only when the user approves." },
  { id: "off", label: "Off", icon: <Ban className="h-3.5 w-3.5" />, hint: "Never apply — actions are inert." },
];

interface MatrxActionsTabProps {
  agentId: string;
}

export function MatrxActionsTab({ agentId }: MatrxActionsTabProps) {
  const dispatch = useAppDispatch();
  const cfg = useAppSelector((state) =>
    selectAgentMatrxActions(state, agentId),
  ) as MatrxActionsConfig;

  const actions = deriveActions(cfg);
  const policy = derivePolicy(cfg);

  const { catalog, isLoading, error } = useActionCatalog();
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");

  const options = buildDirectiveOptions(catalog);
  const labelFor = (type: string) =>
    options.find((o) => o.type === type)?.label ?? type;

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

  // Single canonical write — actions list + policy, preserving a legacy directive.
  const write = (nextActions: string[], nextPolicy: Policy) => {
    const next: MatrxActionsConfig = {};
    if (cfg.directive) next.directive = cfg.directive;
    if (nextActions.length) next.actions = nextActions;
    if (nextPolicy === "auto") next.apply_policy = "auto";
    else if (nextPolicy === "ask") next.apply_policy = "ask";
    else if (nextPolicy === "off") next.apply_policy = "off";
    dispatch(setAgentMatrxActions({ id: agentId, matrxActions: next }));
  };

  const toggle = (type: string) => {
    const has = actions.includes(type);
    write(has ? actions.filter((a) => a !== type) : [...actions, type], policy);
  };
  const remove = (type: string) => write(actions.filter((a) => a !== type), policy);
  const addCustom = () => {
    const t = custom.trim();
    setCustom("");
    if (!t || actions.includes(t)) return;
    write([...actions, t], policy);
  };
  const setPolicy = (p: Policy) => write(actions, p);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-muted-foreground leading-snug">
        <span className="font-medium text-foreground">Matrx Actions</span> are the
        things this agent can do from its output — create tasks or projects, write
        records, run custom actions. List as many as you need. Guidance for them is
        added to the system prompt <span className="font-medium">automatically at
        run time</span> — your authored prompt is never modified.
      </p>

      {/* ── Selected actions ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">
          Actions this agent can perform{actions.length ? ` (${actions.length})` : ""}
        </span>
        {actions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            None yet — pick from the catalog below or add a custom one.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {actions.map((type) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 py-0.5 pl-2 pr-1 text-[11px] text-foreground"
              >
                <span className="font-medium">{labelFor(type)}</span>
                <code className="font-mono text-[10px] text-muted-foreground">{type}</code>
                <button
                  type="button"
                  onClick={() => remove(type)}
                  aria-label={`Remove ${type}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Registry picker + custom add ───────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions…"
            className="w-full rounded-md border border-border bg-background py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {error ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Couldn&apos;t load the live action catalog ({error}). Built-in actions
            are still available below.
          </div>
        ) : null}

        {isLoading && !catalog ? (
          <div className="flex flex-col gap-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-muted/60" />
            ))}
          </div>
        ) : (
          <div className="max-h-52 overflow-y-auto rounded-md border border-border">
            {groups.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                No catalog actions match &ldquo;{query}&rdquo; — add it as a custom
                action below.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.family}>
                  <div className="sticky top-0 bg-muted/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                    {group.family}
                  </div>
                  {group.options.map((opt) => {
                    const checked = actions.includes(opt.type);
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => toggle(opt.type)}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-accent"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background"
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1 text-foreground">{opt.label}</span>
                        <code className="font-mono text-[10px] text-muted-foreground">
                          {opt.type}
                        </code>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}

        {/* Custom action add */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Custom action type (e.g. create:invoice)"
            className="flex-1 rounded-md border border-border bg-background py-1.5 px-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!custom.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
      </div>

      {/* ── Policy ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <span className="text-xs font-semibold text-foreground">How they apply</span>
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
