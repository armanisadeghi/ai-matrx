"use client";

/**
 * MatrxActionsTab — author the agent's Matrx Actions apply config
 * (`agx_agent.matrx_actions` → AgentDefinition.matrxActions).
 *
 * Self-contained: reads/writes Redux directly via the dedicated field — the user
 * never sees or thinks about where it is stored. Friendly policy controls
 * serialize to the canonical `{ apply_policy | auto_apply | allow }` shape the
 * aidream output-directive dispatcher reads. The legacy `directive` raw-output
 * path is surfaced read-only (with a Clear) and otherwise preserved.
 */

import { useState } from "react";
import {
  Zap,
  PlayCircle,
  CircleHelp,
  Ban,
  Search,
  Check,
  Info,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentMatrxActions } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentMatrxActions } from "@/features/agents/redux/agent-definition/slice";
import type { MatrxActionsConfig } from "@/features/agents/types/matrx-actions.types";
import { useActionCatalog } from "@/features/action-catalog/hooks/useActionCatalog";
import {
  buildDirectiveOptions,
  groupDirectiveOptions,
} from "./directiveOptions";

type Policy = "default" | "auto" | "ask" | "off";
type Scope = "all" | "selected";

interface DerivedState {
  policy: Policy;
  scope: Scope;
}

/** Fully derive the UI state from the stored config — no duplicate local state. */
function deriveState(cfg: MatrxActionsConfig): DerivedState {
  if (Array.isArray(cfg.allow)) return { policy: "auto", scope: "selected" };
  if (cfg.apply_policy === "auto" || cfg.auto_apply === true)
    return { policy: "auto", scope: "all" };
  if (cfg.apply_policy === "ask") return { policy: "ask", scope: "all" };
  if (cfg.apply_policy === "off") return { policy: "off", scope: "all" };
  return { policy: "default", scope: "all" };
}

/** Preserve the legacy `directive` (if any) across policy edits. */
function base(cfg: MatrxActionsConfig): MatrxActionsConfig {
  return cfg.directive ? { directive: cfg.directive } : {};
}

const POLICY_OPTIONS: {
  id: Policy;
  label: string;
  icon: React.ReactNode;
  hint: string;
}[] = [
  { id: "default", label: "Default", icon: <Info className="h-3.5 w-3.5" />, hint: "Use the system default (ask the user)." },
  { id: "auto", label: "Auto-apply", icon: <PlayCircle className="h-3.5 w-3.5" />, hint: "Apply the agent's actions automatically." },
  { id: "ask", label: "Ask first", icon: <CircleHelp className="h-3.5 w-3.5" />, hint: "Propose each action; apply only on user approval." },
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

  const { policy, scope } = deriveState(cfg);
  const allow = Array.isArray(cfg.allow) ? cfg.allow : [];

  const { catalog, isLoading, error } = useActionCatalog();
  const [query, setQuery] = useState("");

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

  const commit = (next: MatrxActionsConfig) =>
    dispatch(setAgentMatrxActions({ id: agentId, matrxActions: next }));

  const setPolicy = (p: Policy) => {
    const b = base(cfg);
    if (p === "default") return commit(b);
    if (p === "ask") return commit({ ...b, apply_policy: "ask" });
    if (p === "off") return commit({ ...b, apply_policy: "off" });
    // auto — keep the existing allow-list if we were already in "selected"
    if (Array.isArray(cfg.allow)) return commit({ ...b, allow: cfg.allow });
    return commit({ ...b, apply_policy: "auto" });
  };

  const setScope = (s: Scope) => {
    const b = base(cfg);
    if (s === "all") return commit({ ...b, apply_policy: "auto" });
    return commit({ ...b, allow: allow });
  };

  const toggleAction = (type: string) => {
    const b = base(cfg);
    const next = allow.includes(type)
      ? allow.filter((t) => t !== type)
      : [...allow, type];
    commit({ ...b, allow: next });
  };

  const clearDirective = () => {
    const { directive: _omit, ...rest } = cfg;
    void _omit;
    commit(rest);
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-muted-foreground leading-snug">
        <span className="font-medium text-foreground">Matrx Actions</span> let this
        agent perform actions from its output — create tasks or projects, write
        records, and more. Choose how those actions are handled. This is stored
        with the agent automatically.
      </p>

      {/* Policy */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-foreground">Apply policy</span>
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

      {/* Scope (only when auto-applying) */}
      {policy === "auto" && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-xs font-semibold text-foreground">
            Which actions auto-apply?
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`flex-1 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
                scope === "all"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              All actions
            </button>
            <button
              type="button"
              onClick={() => setScope("selected")}
              className={`flex-1 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
                scope === "selected"
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              Only selected actions
            </button>
          </div>
        </div>
      )}

      {/* Action picker (only when "selected") */}
      {policy === "auto" && scope === "selected" && (
        <div className="flex flex-col gap-2">
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
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {allow.length} selected
            </span>
          </div>

          {error ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              Couldn&apos;t load the action catalog ({error}). Built-in actions are
              still available; reopen to retry the live list.
            </div>
          ) : isLoading ? (
            <div className="flex flex-col gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-7 animate-pulse rounded bg-muted/60"
                />
              ))}
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded-md border border-border">
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
                    {group.options.map((opt) => {
                      const checked = allow.includes(opt.type);
                      return (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => toggleAction(opt.type)}
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
          <p className="text-[11px] text-muted-foreground">
            Selected actions auto-apply; any other action the agent emits falls back
            to the default (ask the user).
          </p>
        </div>
      )}

      {/* Legacy declared-directive notice */}
      {cfg.directive && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <div className="flex-1 leading-snug text-muted-foreground">
            This agent uses the legacy declared-directive path:{" "}
            <code className="font-mono text-foreground">{cfg.directive}</code>. New
            agents should use the apply policy above instead.
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
  );
}
