/**
 * features/surfaces/runtime/surface-feedback.ts
 *
 * THE PLATFORM WRITE TARGET `surface_feedback` — an agent working on ANY
 * mounted surface can leave feedback about that surface for the team ("the
 * class list arrived as a lookup, not inline", "there is no target to change
 * exam dates", "create_classes never said X"). The team reads it the next time
 * it updates that surface (`pnpm surface:feedback --surface <name>`).
 *
 * Like `window_form_fields` (`window-forms.ts`) it is declared once on the
 * baseline surface (`_baseline.manifest.ts`): `listLiveWriteTargets` offers it
 * whenever at least one registered surface is mounted, and it is written
 * through the one write door (`surface-writeback.ts` `applyPlatformWrite`). It changes NOTHING on the page, so
 * it is `auto` — the person is never interrupted by a card for it.
 *
 * Storage is the central triage table `users.user_feedback`, written through
 * the host's feedback port — in matrx-frontend the ONE existing submit path
 * (`submitFeedback`, the same action the in-app feedback window uses) — filed
 * in the organization the person is acting in.
 */

import { getChatHost } from "../../host/configure";
import type { ChatFeedbackInput, ChatFeedbackType } from "../../host/contract";
import { getStoreSingleton } from "../../store/store-singleton";
import type { SurfaceWriteTarget } from "../types";
import {
  PLATFORM_WRITE_TARGETS,
  SURFACE_FEEDBACK_KINDS,
  SURFACE_FEEDBACK_MESSAGE_MAX,
  SURFACE_FEEDBACK_MESSAGE_MIN,
} from "../manifests/_baseline.manifest";
import type { SurfaceWriteOutcome } from "./SurfaceRuntimeContext";

export const SURFACE_FEEDBACK_TARGET_NAME = PLATFORM_WRITE_TARGETS.surface_feedback.name;

export type SurfaceFeedbackKind = (typeof SURFACE_FEEDBACK_KINDS)[number];

export interface SurfaceFeedbackValue {
  kind: SurfaceFeedbackKind;
  message: string;
  target_or_value?: string;
}

const KIND_LIST = SURFACE_FEEDBACK_KINDS.join(" | ");

/** The platform target — declared once on the baseline surface (`_baseline.manifest.ts`); offered whenever a surface is mounted. */
export const SURFACE_FEEDBACK_TARGET: SurfaceWriteTarget = PLATFORM_WRITE_TARGETS.surface_feedback;

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
export function feedbackTypeForKind(kind: SurfaceFeedbackKind): ChatFeedbackType {
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

/** The exact feedback-port input one feedback write files. */
export function buildSurfaceFeedbackInput(
  value: SurfaceFeedbackValue,
  ctx: SurfaceFeedbackContext,
): ChatFeedbackInput {
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
  const result = await getChatHost().feedback.submit(
    buildSurfaceFeedbackInput(value, ctx),
  );
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
