/**
 * Send one guided tutorial to one person — the admin "Send a tutorial" action.
 *
 * Two existing doors, no new transport:
 *   - DM: `sendDirectActionMessage` (the framework-free `@ai-matrx/messaging`
 *     path) with a `guided_tutorial` action envelope, so the bubble carries the
 *     "Show me how" card (features/messaging/actions/messageActionSurfaces.tsx).
 *   - Email: `sendAdminEmail` (`/api/admin/email`, super-admin, Resend) — the
 *     same door the coupon sender uses. It carries the same `?tutorial=` link.
 *
 * Each channel reports its own outcome: a failed email never hides a sent DM.
 */

import { sendDirectActionMessage } from "@/features/messaging/service/sendDirectActionMessage";
import type { GuidedTutorialActionPayload } from "@/features/messaging/types";
import { sendAdminEmail } from "@/features/admin/users/service/coupons";
import { type GuidedTutorial, tutorialHref } from "../registry";

export interface SendTutorialInput {
  tutorial: GuidedTutorial;
  userId: string;
  /** Recipient's email; absent → the email route resolves it from `userId`. */
  email?: string | null;
  note?: string | null;
  organizationId?: string | null;
  channels: { dm: boolean; email: boolean };
  /** Absolute origin for the email link (window.location.origin). */
  origin: string;
}

export interface ChannelOutcome {
  ok: boolean;
  error?: string;
}

export interface SendTutorialResult {
  dm?: ChannelOutcome;
  email?: ChannelOutcome;
}

export function tutorialDmText(tutorial: GuidedTutorial, note?: string | null): string {
  const lead = note?.trim();
  return lead ? lead : `Here's a quick walkthrough: ${tutorial.title}.`;
}

export function tutorialEmailBody(tutorial: GuidedTutorial, origin: string, note?: string | null): string {
  const link = `${origin}${tutorialHref(tutorial)}`;
  const lead = note?.trim() || `Here's a quick walkthrough: ${tutorial.title}.`;
  return `${lead}\n\nOpen it in AI Matrx and we'll show you each step:\n${link}`;
}

export async function sendTutorial(input: SendTutorialInput): Promise<SendTutorialResult> {
  const { tutorial } = input;
  const result: SendTutorialResult = {};
  const tasks: Promise<void>[] = [];

  if (input.channels.dm) {
    const payload: GuidedTutorialActionPayload = {
      tutorial_id: tutorial.id,
      title: tutorial.title,
      href: tutorialHref(tutorial),
    };
    tasks.push(
      sendDirectActionMessage({
        recipientId: input.userId,
        organizationId: input.organizationId ?? null,
        content: tutorialDmText(tutorial, input.note),
        actionData: { kind: "guided_tutorial", version: 1, payload },
      }).then(
        () => {
          result.dm = { ok: true };
        },
        (error: unknown) => {
          result.dm = { ok: false, error: error instanceof Error ? error.message : String(error) };
        },
      ),
    );
  }

  if (input.channels.email) {
    tasks.push(
      sendAdminEmail({
        ...(input.email ? { to: input.email } : { userId: input.userId }),
        subject: tutorial.title,
        message: tutorialEmailBody(tutorial, input.origin, input.note),
      }).then(
        () => {
          result.email = { ok: true };
        },
        (error: unknown) => {
          result.email = { ok: false, error: error instanceof Error ? error.message : String(error) };
        },
      ),
    );
  }

  await Promise.all(tasks);
  return result;
}
