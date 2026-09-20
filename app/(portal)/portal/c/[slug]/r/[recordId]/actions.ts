"use server";

// The two things a client can DO on her own record: change a field the portal
// opened, and say something where the portal allows comments.
//
// 🚨 THE BROWSER NAMES THE SLUG AND THE RECORD, NEVER THE ORGANIZATION. The
// organization id is resolved HERE from `custom.portal_me()` — the door's own
// answer for `auth.uid()` — so a crafted request cannot point a write at an
// organization the caller is not a principal of. It would be refused anyway
// (the door checks, not this file), but handing a door an attacker-supplied
// scope and relying on it to say no is one mistake away from a hole.
//
// A REFUSAL IS CARRIED WHOLE. `custom.record_update` refuses a field the portal
// did not open with its own sentence — "You can see this record, but "Stage" is
// not yours to change." — plus a hint that says what it would take. Both are
// returned to the screen verbatim. Nothing here rewrites them into "Save
// failed", and nothing here swallows one.

import { revalidatePath } from "next/cache";

import {
  DoorRefusal,
  membershipFor,
  portalCommentWrite,
  portalMe,
  portalRecordUpdate,
} from "@/features/portals/service";

export interface PortalWriteOutcome {
  ok: boolean;
  /** The door's own sentence when it refused. */
  message?: string;
  /** The door's own hint — what it would take — when it gave one. */
  hint?: string | null;
}

function refusalOutcome(error: unknown): PortalWriteOutcome {
  if (error instanceof DoorRefusal) {
    return { ok: false, message: error.message, hint: error.hint };
  }
  return {
    ok: false,
    message:
      error instanceof Error
        ? error.message
        : "That did not save, and we do not know why. Nothing was changed.",
    hint: null,
  };
}

async function organizationFor(slug: string): Promise<string | null> {
  const membership = membershipFor(await portalMe(), slug);
  return membership?.organization_id ?? null;
}

/** Change one field on one record. The door decides whether it may change. */
export async function savePortalField(
  slug: string,
  recordId: string,
  key: string,
  value: string,
): Promise<PortalWriteOutcome> {
  const organizationId = await organizationFor(slug);
  if (!organizationId) {
    return {
      ok: false,
      message: "You are not signed in to this portal any more. Open your sign-in link again.",
      hint: null,
    };
  }
  try {
    await portalRecordUpdate({ organizationId, recordId, patch: { [key]: value } });
  } catch (error) {
    return refusalOutcome(error);
  }
  revalidatePath(`/portal/c/${slug}/r/${recordId}`);
  revalidatePath(`/portal/c/${slug}`);
  return { ok: true };
}

/** Say something on one record. The door decides whether comments are open. */
export async function addPortalComment(
  slug: string,
  recordId: string,
  body: string,
): Promise<PortalWriteOutcome> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, message: "Write something first.", hint: null };

  const organizationId = await organizationFor(slug);
  if (!organizationId) {
    return {
      ok: false,
      message: "You are not signed in to this portal any more. Open your sign-in link again.",
      hint: null,
    };
  }
  try {
    await portalCommentWrite({ organizationId, recordId, body: trimmed });
  } catch (error) {
    return refusalOutcome(error);
  }
  revalidatePath(`/portal/c/${slug}/r/${recordId}`);
  return { ok: true };
}
