/**
 * Cloud Browser host ports for the package's credential capture card
 * (`@ai-matrx/chat/agents/ui-first-tools/ui/CredentialCaptureCard`, D-11).
 *
 * The card owns the leak boundary and the deadline; these own transport:
 * `save` writes the values to the vault (POST /api/vault/browser-login/capture)
 * and then a value-free receipt to the browser-manager run; `dismiss` records
 * cancelled/expired. Neither keeps a value.
 */

import { toast } from "@/lib/toast";
import type {
  CredentialCaptureCardProps,
} from "@ai-matrx/chat/agents/ui-first-tools/ui/CredentialCaptureCard";
import { recordCaptureOutcome, submitCredentialCapture } from "./service";
import type { CredentialCaptureRequest } from "./types";

export function cloudBrowserCapturePorts(input: {
  runId: string;
  profileId: string;
  request: CredentialCaptureRequest;
  /** Re-read the run so the retired card disappears. */
  onSettled: () => void;
}): CredentialCaptureCardProps {
  const { runId, profileId, request, onSettled } = input;
  return {
    spec: {
      id: request.handoffId,
      host: request.host,
      displayName: request.displayName,
      branch: request.branch,
      expiresAtMs: new Date(request.expiresAt).getTime(),
      fields: request.fields.map((f) => ({ fieldKey: f.fieldKey, label: f.label, secret: f.secret })),
    },
    async save(values) {
      try {
        await submitCredentialCapture({ runId, profileId, request, values });
      } catch (cause) {
        return {
          ok: false,
          message: cause instanceof Error ? cause.message : "Could not save this sign-in. Try again or cancel.",
        };
      }
      toast.success("Saved to your vault.", {
        description: "Your agent can sign in now without ever seeing it.",
      });
      onSettled();
      return { ok: true };
    },
    async dismiss(reason) {
      await recordCaptureOutcome({ runId, handoffId: request.handoffId, status: reason });
      onSettled();
    },
  };
}
