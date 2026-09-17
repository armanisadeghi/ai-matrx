/**
 * The file types are DECLARED ONCE, in `./resource-types.ts`, together with
 * everything a surface needs to draw one. This union used to be a hand-typed
 * pair here, which is how `google_presentation` — a type the server has shipped
 * and already registered live — reached the attach call and then had nowhere to
 * render (V13-3).
 */
export type { GoogleWorkspaceResourceType } from "./resource-types";
import type { GoogleWorkspaceResourceType } from "./resource-types";
import type { ReviewedGmailSendContext } from "@/features/crm/gmail/reviewed-send-contract";

/**
 * What the reviewed send ANSWERS — the message id, the addresses the server's
 * ONE parser read, and the sent record it wrote. Declared once, in the feature
 * that owns the contract; re-exported here because this is where the transport's
 * callers already look for its types.
 */
export type {
  ReviewedGmailSendContext,
  ReviewedGmailSendOutcome,
} from "@/features/crm/gmail/reviewed-send-contract";

export interface SelectedGoogleFile {
  id: string;
  connectionId: string;
  resourceType: GoogleWorkspaceResourceType;
  fileId: string;
  name: string;
  mimeType: string;
  webViewLink: string | null;
}

export interface GoogleDocumentContent {
  fileId: string;
  title: string;
  text: string;
  truncated: boolean;
}

export interface GoogleSheetValues {
  fileId: string;
  range: string;
  values: string[][];
  truncated: boolean;
}

/**
 * One reviewed Gmail send: the bytes on the card, plus WHERE THE SERVER FILES
 * THE RECORD.
 *
 * 🚨 The record half is not optional decoration. The server now writes the
 * `crm.interaction` row, its association edges and the `crm.sending_event` — so
 * a draft that carries no context is a message with no history, and one that
 * carries no organization is refused (422) because the unsubscribe and blocklist
 * checks live on that organization's own rows. The shape and every wire name are
 * `features/crm/gmail/reviewed-send-contract.ts`, which is measured against the
 * server's own Pydantic models.
 */
export interface ReviewedGmailDraft {
  connectionId: string;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  context: ReviewedGmailSendContext;
}
