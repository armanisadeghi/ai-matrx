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
