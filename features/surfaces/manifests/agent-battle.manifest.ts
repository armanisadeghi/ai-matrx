/**
 * Surface manifest — Agent Battle (`matrx-user/agent-battle`).
 *
 * Every Agent Battle mode except Model (`/agents/battle`, `/variations`,
 * `/tuning`, `/settings`, `/tools`, `/system-prompt`, `/request-mod`,
 * `/conversation`, and each saved battle's `/<mode>/<id>`). Model mode keeps
 * its own richer surface, `matrx-user/agent-comparison-model`.
 *
 * The emitter is `BattleSurfaceRuntime`; its scope is the same
 * `buildBattleSnapshot` the header's battle-wide Alchemy menu copies, so an
 * agent and a person always see the same battle. Read-only: no write targets,
 * and no fixed agent job runs here, so no agent role is declared.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "battle_identity",
    label: "Battle",
    sortOrder: 100,
    description: "Which mode this is, what it varies, and the saved battle.",
  },
  {
    key: "battle_setup",
    label: "Battle setup",
    sortOrder: 200,
    description:
      "What every column shares: the agent, the shared request, or the conversation they were forked from.",
  },
  {
    key: "battle_outcomes",
    label: "Battle outcomes",
    sortOrder: 300,
    description: "Each column's variant, request, answer, scores and run numbers.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "battle_mode",
    label: "Battle mode",
    description:
      "The mode on screen and what it varies between columns, e.g. { mode: \"tools\", label: \"Tools battle\", varies: \"the tools the agent can use\" }. Always present on a battle page.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 160,
    group: "battle_identity",
    sortOrder: 100,
  },
  {
    name: "battle",
    label: "Saved battle",
    description:
      "The saved battle's id, name and URL. Empty before the battle's first run, when it has not been saved yet.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    group: "battle_identity",
    sortOrder: 110,
  },
  {
    name: "blind_state",
    label: "Blind test state",
    description:
      "Whether a blind comparison is active and whether it has been revealed. While active and unrevealed, column identities, variants and run numbers are withheld from every other value.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 50,
    group: "battle_identity",
    sortOrder: 120,
  },
  {
    name: "battle_agent",
    label: "Battle agent",
    description:
      "The one agent every column runs (id, name, version). Empty in Open mode (each column picks its own agent), in Conversation mode, and before an agent is chosen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "battle_setup",
    sortOrder: 200,
  },
  {
    name: "shared_request",
    label: "Shared request",
    description:
      "The message and resolved variable values Submit all sends to every column. Only in modes with one shared request; empty in Open, Request Mod and Conversation mode.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    group: "battle_setup",
    sortOrder: 210,
  },
  {
    name: "forked_from",
    label: "Forked from",
    description:
      "Conversation mode only: the conversation every column was forked from (id and title). Empty in every other mode.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 100,
    group: "battle_setup",
    sortOrder: 220,
  },
  {
    name: "battle_columns",
    label: "Battle columns",
    description:
      "One entry per column, in screen order: label, what this column varies (model, settings, system prompt, tools, agent), its own request where it has one, status, latest answer, transcript, the person's scores, and run numbers. Empty when no column exists yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    group: "battle_outcomes",
    sortOrder: 300,
  },
  {
    name: "feedback_rubric",
    label: "Scoring rubric",
    description:
      "The rating dimensions (id, label, prompt) the person scores each answer on.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 900,
    autoContext: false,
    group: "battle_outcomes",
    sortOrder: 310,
  },
];

export const agentBattleManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-battle",
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Side-by-side agent comparisons in every mode except Model: what the battle varies, what the columns share, and each column's answer and scores.",
  label: "Agent Battle",
  readiness: "partial",
  readinessNote:
    "Manifest, route mapping and emitter are wired and the per-answer 'Prepare this page' reads it. Not yet certified: no outside-helper binding has been exercised live (Matrx-vs-matrix test) on this surface.",
  urlPattern: "/agents/battle",
  intro: `<surface_intro>
Agent Battle runs the same work through several columns side by side so a person can compare the answers. Each mode varies one thing and holds the rest constant — battle_mode.varies says which.

- battle_mode and battle say which experiment this is and which saved battle it belongs to.
- battle_agent, shared_request and forked_from are what every column shares (which of them applies depends on the mode).
- battle_columns holds each column's variant, request, answer, transcript, the person's scores and run numbers — the evidence.
- While blind_state shows an active, unrevealed blind test, column identities, variants and run numbers are deliberately withheld; the answers are labelled anonymously.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("content", "context"), surfaceSpecific),
};

export function createAgentBattleScope(values: {
  content?: string;
  context?: Record<string, unknown>;
  battle_mode: Record<string, unknown>;
  battle?: Record<string, unknown>;
  blind_state: Record<string, unknown>;
  battle_agent?: Record<string, unknown>;
  shared_request?: Record<string, unknown>;
  forked_from?: Record<string, unknown>;
  battle_columns?: object[];
  feedback_rubric: object[];
}): SurfaceScopePayload {
  return values;
}
