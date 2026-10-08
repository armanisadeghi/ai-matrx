"use client";

// Dev-only: the handoff half of the signing door, straight over `callApi`, for proving the creator
// against a real aidream. Once the signer lane's door sends handoff arguments this goes away.

import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";
import type { SignerDoorApi } from "@/features/esign/contract/signerDoor";

type Loose = (config: Record<string, unknown>) => Parameters<AppDispatch>[0];

export function makeRealHandoffDoor(dispatch: AppDispatch, envelopeId: string): SignerDoorApi {
  async function act(action: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const call = callApi as unknown as Loose;
    const result = (await dispatch(
      call({
        path: "/esign/signing/envelope/{envelope_id}/act",
        method: "POST",
        pathParams: { envelope_id: envelopeId },
        body: { action, args },
        expectedErrorStatuses: [409, 422],
        organizationFreeRead: true,
      }),
    )) as { data?: Record<string, unknown>; error?: unknown };
    if (!result.data) throw new Error(`transport: ${JSON.stringify(result.error)}`);
    if (result.data.granted === false) throw new Error(String(result.data.reason ?? "refused"));
    return result.data;
  }
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const door = {
    seat: "signed_in" as const,
    async handoffStart(target: string) {
      const a = await act("handoff_start", { target });
      return { handoff_id: s(a.handoff_id), path: s(a.path), secret: s(a.secret), expires_at: s(a.expires_at) };
    },
    async handoffText(handoff_id: string, secret: string, phone: string) {
      const a = await act("handoff_text", { handoff_id, secret, phone });
      return { last4: s(a.last4) };
    },
    async handoffStatus(handoff_id: string) {
      const a = await act("handoff_status", { handoff_id });
      return {
        status: s(a.status) || "waiting",
        image_base64: s(a.image_base64) || undefined,
        mime_type: s(a.mime_type) || undefined,
        method: a.method === "drawn" || a.method === "uploaded" ? a.method : undefined,
      };
    },
    async adopt(input: Record<string, unknown>) {
      const a = await act("adopt", input);
      return { target: s(a.target) || String(input.target), image_base64: s(a.image_base64) };
    },
    async handoffCancel(handoff_id: string) {
      await act("handoff_cancel", { handoff_id });
    },
  };
  return door as unknown as SignerDoorApi;
}
