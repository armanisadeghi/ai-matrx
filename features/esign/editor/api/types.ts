// features/esign/editor/api/types.ts — everything the editor needs from the server, as one interface
// so the dev demo can run on an in-memory mock and production on the real doors (CONTRACT §6.1, §7).

import type { EnvelopeDraftV1, EnvelopeTemplateV1 } from "../../contract/draft";

export class DraftRefusal extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DraftRefusal";
  }
}

export type SaveResult =
  | { ok: true; revision: number; savedAt: string }
  | { ok: false; reason: "stale"; revision: number; composition: EnvelopeDraftV1 };

export interface DetectCandidate {
  candidate_id: string;
  kind: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  source: "acroform" | "text_anchor" | "line";
  confidence: number;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  organization_id: string;
  organization_name: string | null;
  i_manage: boolean;
  updated_at: string;
  /** The door answers each document and each role, not a count (CONTRACT §6.1). */
  documents: { name: string | null; page_count: number | null }[];
  roles: (string | null)[];
}

export interface SendResult {
  envelope_id: string;
  status: string;
  notified: number;
  warnings: { code: string; recipient_key?: string }[];
}

export interface EditorApi {
  /** Mark of what the page is running on, shown nowhere in production; the demo prints it. */
  readonly kind: "real" | "mock";
  createDraft(input: { organizationId: string; title: string; templateId?: string; copyOfEnvelopeId?: string }): Promise<{
    envelopeId: string;
    revision: number;
    composition: EnvelopeDraftV1;
  }>;
  loadDraft(envelopeId: string): Promise<{ revision: number; composition: EnvelopeDraftV1; status: string; organizationId: string } | null>;
  saveDraft(envelopeId: string, composition: EnvelopeDraftV1, baseRevision: number): Promise<SaveResult>;
  /** Best-effort save while the page is going away (keepalive). */
  saveDraftOnExit(envelopeId: string, composition: EnvelopeDraftV1, baseRevision: number): void;
  setAccessCode(envelopeId: string, recipientKey: string, code: string | null): Promise<{ hasAccessCode: boolean }>;
  deleteDraft(envelopeId: string): Promise<void>;
  send(envelopeId: string): Promise<SendResult>;
  detectFields(fileId: string): Promise<DetectCandidate[]>;
  saveTemplate(input: {
    organizationId: string;
    templateId: string | null;
    name: string;
    description: string;
    composition: EnvelopeTemplateV1;
    expectedVersion?: number | null;
  }): Promise<{ templateId: string; version: number }>;
  getTemplate(templateId: string): Promise<{ id: string; name: string; description: string | null; organizationId: string; version: number; composition: EnvelopeTemplateV1 } | null>;
  listTemplates(input: { lane: "all" | "mine"; orgId: string | null; search: string }): Promise<TemplateRow[]>;
  deleteTemplate(templateId: string): Promise<void>;
}
