/**
 * Matrx Actions — the agent's apply configuration.
 *
 * The "Matrx Actions" system (canonical spec: aidream `docs/protocol/MATRX_ACTIONS.md`)
 * lets a model emit output directives (create a task/project, db_create/db_update,
 * or any `verb:noun` action) that take effect as a side effect after the run.
 * THIS object is the agent layer of the apply-policy cascade: it declares whether
 * those directives auto-apply, ask the user first, or are off — and for which
 * action types.
 *
 * Persisted in the dedicated `agx_agent.matrx_actions` / `agx_version.matrx_actions`
 * jsonb column. Read by aidream's output-directive dispatcher. This is the full
 * rebrand of the retired `settings["output_apply"]` key — that name exists nowhere.
 */

export type MatrxActionApplyPolicy = "auto" | "ask" | "off";

export interface MatrxActionsConfig {
  /** The action types this agent can perform — `verb:noun` (canonical catalog),
   *  named built-in directives, or custom free-form types. An agent may list as
   *  many as it needs (mixed normal + custom). This is the guidance source: the
   *  system-prompt builder injects structure guidance for each at RUNTIME (it
   *  never edits the authored prompt). The apply policy below governs how they
   *  apply. */
  actions?: string[];
  /** Explicit apply policy; wins over auto_apply/allow. Applies to ALL action types. */
  apply_policy?: MatrxActionApplyPolicy;
  /** Opt ALL action types into auto-apply. */
  auto_apply?: boolean;
  /** Opt only these directive types into auto-apply (legacy per-type scope; the
   *  modern UI uses `actions` + `apply_policy`). */
  allow?: string[];
  /** Legacy agent-declared raw-output directive — read-only in the UI; being retired. */
  directive?: string;
}

/** The empty default — no Matrx Actions configured (system default policy applies). */
export const EMPTY_MATRX_ACTIONS: MatrxActionsConfig = {};
