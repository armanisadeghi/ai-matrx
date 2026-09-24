"use server";

// Send one of HER portal's forms (lane S6). The browser names the slug, the form and the
// answers — never the organization, the portal id or the client. The organization and portal
// are resolved HERE from `custom.portal_me()` for the signed-in person, and the Field that says
// which client this is for is filled by the STORE with her own record
// (`custom.portal_form_submit`); a request that tries to fill it is refused by the door.
//
// A refusal is carried whole — the store's sentence ("This form needs what is wrong, which
// unit.") is what the screen shows, never "Submit failed".

import { revalidatePath } from "next/cache";

import { DoorRefusal, membershipFor, portalFormSubmit, portalMe } from "@/features/portals/service";

export interface PortalFormSendOutcome {
  ok: boolean;
  state: string | null;
  message: string | null;
  recordId: string | null;
}

export async function sendPortalForm(
  slug: string,
  formId: string,
  answers: Record<string, unknown>,
  clientKey: string | null,
): Promise<PortalFormSendOutcome> {
  const membership = membershipFor(await portalMe(), slug);
  if (!membership) {
    return {
      ok: false,
      state: null,
      message: "You are not signed in to this portal any more. Open your sign-in link again — your answers are still on this page.",
      recordId: null,
    };
  }
  try {
    const answer = await portalFormSubmit({
      organizationId: membership.organization_id,
      portalId: membership.portal_id,
      formId,
      answers,
      clientKey,
    });
    const ok = answer.state === "accepted" || answer.state === "held";
    if (ok) revalidatePath(`/portal/c/${slug}`);
    return { ok, state: answer.state, message: answer.message, recordId: answer.record_id };
  } catch (error) {
    if (error instanceof DoorRefusal) {
      return {
        ok: false,
        state: "refused",
        message: error.hint ? `${error.message} ${error.hint}` : error.message,
        recordId: null,
      };
    }
    return {
      ok: false,
      state: null,
      message: "This did not reach the business — the connection dropped. Nothing was sent, so sending again is safe.",
      recordId: null,
    };
  }
}
