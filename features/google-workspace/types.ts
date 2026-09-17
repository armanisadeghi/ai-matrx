export type GoogleWorkspaceResourceType =
  "google_document" | "google_spreadsheet";

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

export interface ReviewedGmailDraft {
  connectionId: string;
  to: string;
  cc: string[];
  subject: string;
  body: string;
}

/**
 * What the reviewed send answers: Gmail's own message id, and WHO IT REACHED as
 * the server's ONE recipient parser read the fields (bare addresses, display
 * names stripped). `to` / `cc` are `null` from a server older than aidream lane
 * B-10 — never an empty string or an empty list, so a caller can tell "nobody
 * told me" from "nobody was Cc'd".
 */
export interface ReviewedGmailReceipt {
  messageId: string;
  to: string | null;
  cc: string[] | null;
}
