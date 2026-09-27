/**
 * features/surfaces/runtime/surface-feedback.ts
 *
 * THE PLATFORM WRITE TARGET `surface_feedback` — an agent working on ANY
 * mounted surface can leave feedback about that surface for the team ("the
 * class list arrived as a lookup, not inline", "there is no target to change
 * exam dates", "create_classes never said X"). The team reads it the next time
 * it updates that surface (`pnpm surface:feedback --surface <name>`).
 *
 * Like `window_form_fields` (`window-forms.ts`) it is declared here once and
 * belongs to no manifest: `listLiveWriteTargets` offers it whenever at least
 * one registered surface is mounted, and `applySurfaceWrite` routes it to
 * `applySurfaceFeedbackWrite` in the seam. It changes NOTHING on the page, so
 * it is `auto` — the person is never interrupted by a card for it.
 *
 * Storage is the central triage table `users.user_feedback`, written through
 * the ONE existing submit path (`submitFeedback`, the same action the in-app
 * feedback window uses), filed in the organization the person is acting in.
 */

import { submitFeedback } from "@/actions/feedback.actions";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import type { CreateFeedbackInput, FeedbackType } from "@/types/feedback.types";
import type { SurfaceWriteTarget } from "@/features/surfaces/types";
import type { SurfaceWriteOutcome } from "./SurfaceRuntimeContext";

export const SURFACE_FEEDBACK_TARGET_NAME = "surface_feedback";

export const SURFACE_FEEDBACK_KINDS = [
  "missing_capability",
  "wrong_or_unclear_description",
  "bug",
  "missing_data",
  "suggestion",
] as const;
export type SurfaceFeedbackKind = (typeof SURFACE_FEEDBACK_KINDS)[number];

export const SURFACE_FEEDBACK_MESSAGE_MIN = 10;
export const SURFACE_FEEDBACK_MESSAGE_MAX = 4000;

export interface SurfaceFeedbackValue {
  kind: SurfaceFeedbackKind;
  message: string;
  target_or_value?: string;
}

const KIND_LIST = SURFACE_FEEDBACK_KINDS.join(" | ");

/** The platform target — declared once; offered whenever a surface is mounted. */
export const SURFACE_FEEDBACK_TARGET: SurfaceWriteTarget = {
  name: SURFACE_FEEDBACK_TARGET_NAME,
  label: "Feedback about this page",
  description:
    "Save feedback about this page (surface) for the team that builds it — it changes NOTHING on the page and nobody is asked. " +
    "Use it when something about the page got in your way: a write you needed does not exist, a description was wrong or unclear, " +
    "data you needed was missing or arrived in an awkward form, or something broke. Also use it when the person asks you to give feedback on this page. " +
    `Value: { "kind": "${KIND_LIST}", "message": "<what happened and what would have helped, ${SURFACE_FEEDBACK_MESSAGE_MIN}-${SURFACE_FEEDBACK_MESSAGE_MAX} characters>", "target_or_value": "<optional: the write target or value name it concerns>" }. ` +
    "It is filed for the surface named on this line; pass `surface` to file it for another open surface instead.",
  valueType: "object",
  mode: "entity",
  applyPolicy: "auto",
};

const ALLOWED_KEYS = new Set(["kind", "message", "target_or_value"]);

/**
 * Pre-write check. Throws a sentence the agent can act on; nothing is written
 * when it throws.
 */
export function validateSurfaceFeedback(
  value: unknown,
): asserts value is SurfaceFeedbackValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `surface_feedback expects an object { kind, message, target_or_value? }. Nothing was saved.`,
    );
  }
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    throw new Error(
      `surface_feedback does not take ${unknownKeys.map((k) => `"${k}"`).join(", ")} — only kind, message and target_or_value. Nothing was saved.`,
    );
  }
  if (
    typeof record.kind !== "string" ||
    !(SURFACE_FEEDBACK_KINDS as readonly string[]).includes(record.kind)
  ) {
    throw new Error(
      `surface_feedback "kind" must be one of ${KIND_LIST}; received ${JSON.stringify(record.kind ?? null)}. Nothing was saved.`,
    );
  }
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (message.length < SURFACE_FEEDBACK_MESSAGE_MIN) {
    throw new Error(
      `surface_feedback "message" must say what happened in at least ${SURFACE_FEEDBACK_MESSAGE_MIN} characters. Nothing was saved.`,
    );
  }
  if (message.length > SURFACE_FEEDBACK_MESSAGE_MAX) {
    throw new Error(
      `surface_feedback "message" is ${message.length} characters; the limit is ${SURFACE_FEEDBACK_MESSAGE_MAX}. Shorten it. Nothing was saved.`,
    );
  }
  if (
    record.target_or_value !== undefined &&
    record.target_or_value !== null &&
    typeof record.target_or_value !== "string"
  ) {
    throw new Error(
      `surface_feedback "target_or_value" must be a string (a write target or value name). Nothing was saved.`,
    );
  }
}

/** Triage vocabulary (`users.user_feedback.feedback_type`). */
export function feedbackTypeForKind(kind: SurfaceFeedbackKind): FeedbackType {
  if (kind === "bug") return "bug";
  if (kind === "missing_capability") return "feature";
  return "suggestion";
}

export interface SurfaceFeedbackContext {
  surfaceName: string;
  route: string;
  organizationId: string;
  conversationId?: string;
  agentId?: string;
  agentName?: string;
}

/** The exact `submitFeedback` input one feedback write files. */
export function buildSurfaceFeedbackInput(
  value: SurfaceFeedbackValue,
  ctx: SurfaceFeedbackContext,
): CreateFeedbackInput {
  const message = value.message.trim();
  const targetOrValue = value.target_or_value?.trim() || null;
  return {
    feedback_type: feedbackTypeForKind(value.kind),
    route: ctx.route,
    organization_id: ctx.organizationId,
    description:
      `[surface feedback] ${ctx.surfaceName} · ${value.kind}` +
      (targetOrValue ? ` · ${targetOrValue}` : "") +
      `\n\n${message}`,
    metadata: {
      source: "surface_agent_feedback",
      surface_name: ctx.surfaceName,
      kind: value.kind,
      target_or_value: targetOrValue,
      ...(ctx.conversationId ? { conversation_id: ctx.conversationId } : {}),
      ...(ctx.agentId ? { agent_id: ctx.agentId } : {}),
      ...(ctx.agentName ? { agent_name: ctx.agentName } : {}),
    },
  };
}

/** The organization the person is acting in, or null when none is selected. */
export function readActiveOrganizationId(): string | null {
  const state = getStoreSingleton()?.getState() as
    | { appContext?: { organization_id?: string | null } }
    | undefined;
  return state?.appContext?.organization_id ?? null;
}

/**
 * File one validated feedback value. Throws a plain Error when the submit
 * path refuses; the seam turns that into the failure envelope.
 */
export async function saveSurfaceFeedback(
  value: SurfaceFeedbackValue,
  ctx: SurfaceFeedbackContext,
): Promise<SurfaceWriteOutcome> {
  const result = await submitFeedback(buildSurfaceFeedbackInput(value, ctx));
  if (!result.success || !result.data) {
    throw new Error(
      `Saving feedback for ${ctx.surfaceName} failed: ${result.error ?? "no row came back"}.`,
    );
  }
  const id = result.data.id;
  return {
    summary: `Feedback saved for ${ctx.surfaceName} (id ${id}). Thank you — the team reads it on the next update.`,
    data: { id },
  };
}
