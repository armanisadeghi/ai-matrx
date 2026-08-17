// features/voice-agent/relay/questionLedger.ts
//
// The question ledger — rule 4 of THE ROUTING LAW: one question at a time,
// and no question is ever lost. The Communicator (a realtime voice model with
// a short context) tracks every open question here via its client tools; the
// ledger's serialized state is re-injected into EVERY delivery cue, so a
// truncated voice-model context can never forget an unanswered question.
// (The primary agent remains the independent backstop — two layers.)
//
// Pure core + a module-level per-instance store the realtime client-tool
// runner reaches through `ctx.instanceId`. SoR:
// common-docs/systems/voice-communication-layer/FEATURE.md

import type { ResolvedRealtimeTool } from "../types";
import { registerRealtimeClientTool } from "../runtime/client-tool-registry";
import type { LedgerQuestion, LedgerQuestionStatus } from "./types";

export interface QuestionLedger {
  add(text: string): LedgerQuestion;
  setStatus(id: string, status: LedgerQuestionStatus): LedgerQuestion | null;
  all(): LedgerQuestion[];
  pending(): LedgerQuestion[];
  /** Human-readable state for cue injection. Empty string when nothing open. */
  serialize(): string;
  clear(): void;
}

export function createQuestionLedger(): QuestionLedger {
  const questions: LedgerQuestion[] = [];
  let nextId = 1;

  return {
    add(text: string): LedgerQuestion {
      const trimmed = text.trim();
      // Idempotent on identical text — the model retries tool calls.
      const existing = questions.find((q) => q.text === trimmed);
      if (existing) return existing;
      const q: LedgerQuestion = {
        id: `q${nextId++}`,
        text: trimmed,
        status: "pending",
      };
      questions.push(q);
      return q;
    },
    setStatus(id: string, status: LedgerQuestionStatus): LedgerQuestion | null {
      const q = questions.find((item) => item.id === id);
      if (!q) return null;
      q.status = status;
      return q;
    },
    all(): LedgerQuestion[] {
      return questions.map((q) => ({ ...q }));
    },
    pending(): LedgerQuestion[] {
      return questions.filter((q) => q.status !== "answered").map((q) => ({ ...q }));
    },
    serialize(): string {
      const open = questions.filter((q) => q.status !== "answered");
      if (open.length === 0) return "";
      return open
        .map((q) => `${q.id} (${q.status}): ${q.text}`)
        .join("\n");
    },
    clear(): void {
      questions.length = 0;
    },
  };
}

// ── Per-voice-instance ledger store ─────────────────────────────────────────
// The realtime client-tool runner only receives `ctx.instanceId`; this map is
// how a tool call reaches the right session's ledger.

const ledgersByInstance = new Map<string, QuestionLedger>();

export function getOrCreateLedger(instanceId: string): QuestionLedger {
  let ledger = ledgersByInstance.get(instanceId);
  if (!ledger) {
    ledger = createQuestionLedger();
    ledgersByInstance.set(instanceId, ledger);
  }
  return ledger;
}

export function disposeLedger(instanceId: string): void {
  ledgersByInstance.delete(instanceId);
}

// ── The realtime client tool ────────────────────────────────────────────────

export const COMMUNICATION_LEDGER_TOOL_NAME = "communication_ledger";

/**
 * The tool declaration merged into the session's resolved tool set
 * (`execution: "client"` — it runs in this browser, never on the server).
 */
export const COMMUNICATION_LEDGER_TOOL: ResolvedRealtimeTool = {
  name: COMMUNICATION_LEDGER_TOOL_NAME,
  description:
    "Track the open questions you must ask the user, one at a time. " +
    "Use action 'add' when the primary agent's response contains a question " +
    "you are not asking yet; 'mark_asked' when you ask one; 'mark_answered' " +
    "when the user has answered it; 'list' to see the current ledger.",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["add", "mark_asked", "mark_answered", "list"],
      },
      question_id: {
        type: "string",
        description: "The ledger id (e.g. 'q2') for mark_asked / mark_answered.",
      },
      text: {
        type: "string",
        description: "The question text, required for action 'add'.",
      },
    },
    required: ["action"],
  },
  execution: "client",
};

let toolRegistered = false;

/** Idempotent — call once from any surface that mounts the relay. */
export function registerCommunicationLedgerTool(): void {
  if (toolRegistered) return;
  toolRegistered = true;
  registerRealtimeClientTool({
    name: COMMUNICATION_LEDGER_TOOL_NAME,
    run: async (args, ctx) => {
      const ledger = getOrCreateLedger(ctx.instanceId);
      const action = typeof args.action === "string" ? args.action : "";
      switch (action) {
        case "add": {
          if (typeof args.text !== "string" || args.text.trim().length === 0) {
            return "Error: action 'add' requires non-empty 'text'.";
          }
          const q = ledger.add(args.text);
          return `Added ${q.id}. Open questions:\n${ledger.serialize() || "(none)"}`;
        }
        case "mark_asked":
        case "mark_answered": {
          if (typeof args.question_id !== "string") {
            return `Error: action '${action}' requires 'question_id'.`;
          }
          const status = action === "mark_asked" ? "asked" : "answered";
          const q = ledger.setStatus(args.question_id, status);
          if (!q) {
            return `Error: no question '${args.question_id}'. Open questions:\n${ledger.serialize() || "(none)"}`;
          }
          return `Marked ${q.id} ${status}. Open questions:\n${ledger.serialize() || "(none)"}`;
        }
        case "list":
          return ledger.serialize() || "No open questions.";
        default:
          return `Error: unknown action '${action}'.`;
      }
    },
  });
}
