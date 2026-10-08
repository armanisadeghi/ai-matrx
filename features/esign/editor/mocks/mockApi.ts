// features/esign/editor/mocks/mockApi.ts — an in-memory EditorApi for the dev demo ONLY
// (CONTRACT §17.4): slow saves, a stale_draft simulation, canned detect-fields candidates.
// Imported by app/(dev)/demos/esign-sender and nothing else.

import type { EnvelopeDraftV1, EnvelopeTemplateV1 } from "../../contract/draft";
import { emptyDraft, newId } from "../model";
import type { DetectCandidate, EditorApi, TemplateRow } from "../api/types";
import { DraftRefusal } from "../api/types";

interface Row {
  composition: EnvelopeDraftV1;
  revision: number;
  status: string;
}

export interface MockControls {
  /** Milliseconds each save takes (the slow-network proof). */
  saveDelayMs: number;
  /** When true, saves fail (the retry proof). */
  offline: boolean;
}

export function makeMockEditorApi(controls: MockControls) {
  const drafts = new Map<string, Row>();
  const templates = new Map<string, { id: string; name: string; description: string; composition: EnvelopeTemplateV1; version: number; updated_at: string }>();
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const api: EditorApi = {
    kind: "mock",
    async createDraft({ title, templateId }) {
      await sleep(250);
      const id = newId();
      let composition = emptyDraft(title);
      const t = templateId ? templates.get(templateId) : null;
      if (t) {
        composition = {
          ...(t.composition as unknown as EnvelopeDraftV1),
          recipients: t.composition.recipients.map((r) => ({ ...r, has_access_code: false })),
        };
      }
      drafts.set(id, { composition, revision: 1, status: "draft" });
      return { envelopeId: id, revision: 1, composition };
    },
    async loadDraft(id) {
      const row = drafts.get(id);
      return row ? { revision: row.revision, composition: row.composition, status: row.status, organizationId: "demo-org" } : null;
    },
    async saveDraft(id, composition, baseRevision) {
      await sleep(controls.saveDelayMs);
      if (controls.offline) throw new DraftRefusal("unreachable", "offline");
      const row = drafts.get(id);
      if (!row) throw new DraftRefusal("no_access", "No access");
      if (baseRevision !== row.revision) {
        return { ok: false, reason: "stale", revision: row.revision, composition: row.composition };
      }
      row.composition = composition;
      row.revision += 1;
      return { ok: true, revision: row.revision, savedAt: new Date().toISOString() };
    },
    saveDraftOnExit(id, composition, baseRevision) {
      const row = drafts.get(id);
      if (row && row.revision === baseRevision) {
        row.composition = composition;
        row.revision += 1;
      }
    },
    async setAccessCode(_id, _key, code) {
      await sleep(200);
      if (code !== null && code.length < 4) throw new DraftRefusal("code_too_short", "An access code needs at least 4 characters.");
      return { hasAccessCode: code !== null };
    },
    async deleteDraft(id) {
      drafts.delete(id);
    },
    async send(id) {
      await sleep(900);
      const row = drafts.get(id);
      if (row) row.status = "sent";
      return { envelope_id: id, status: "sent", notified: 1, warnings: [] };
    },
    async detectFields(): Promise<DetectCandidate[]> {
      await sleep(700);
      return [
        { candidate_id: "c1", kind: "signature", page: 1, x: 0.12, y: 0.62, w: 0.3, h: 0.05, label: "Signature", source: "text_anchor", confidence: 0.92 },
        { candidate_id: "c2", kind: "date_signed", page: 1, x: 0.58, y: 0.62, w: 0.2, h: 0.035, label: "Date", source: "text_anchor", confidence: 0.88 },
        { candidate_id: "c3", kind: "initials", page: 1, x: 0.8, y: 0.9, w: 0.08, h: 0.045, label: "(initial)", source: "text_anchor", confidence: 0.7 },
        { candidate_id: "c4", kind: "text", page: 1, x: 0.12, y: 0.4, w: 0.4, h: 0.035, label: "Name", source: "acroform", confidence: 0.99 },
        { candidate_id: "c5", kind: "text", page: 1, x: 0.12, y: 0.75, w: 0.4, h: 0.03, label: "Line", source: "line", confidence: 0.3 },
      ];
    },
    async saveTemplate({ templateId, name, description, composition }) {
      await sleep(300);
      const id = templateId ?? newId();
      const version = (templates.get(id)?.version ?? 0) + 1;
      templates.set(id, { id, name, description, composition, version, updated_at: new Date().toISOString() });
      return { templateId: id, version };
    },
    async getTemplate(id) {
      const t = templates.get(id);
      return t ? { id, name: t.name, description: t.description, organizationId: "demo-org", version: t.version, composition: t.composition } : null;
    },
    async listTemplates(): Promise<TemplateRow[]> {
      return [...templates.values()].map((t) => ({
        id: t.id, name: t.name, description: t.description, organization_id: "demo-org", organization_name: "Demo org",
        i_manage: true, updated_at: t.updated_at, documents: t.composition.documents.map((d) => ({ name: d.name, page_count: d.page_count })), roles: t.composition.recipients.map((r) => r.template_role ?? null),
      }));
    },
    async deleteTemplate(id) {
      templates.delete(id);
    },
  };

  /** Simulate a second tab saving a different title / a changed field — the conflict proof. */
  function simulateOtherTab(id: string, change: (d: EnvelopeDraftV1) => EnvelopeDraftV1) {
    const row = drafts.get(id);
    if (!row) return;
    row.composition = change(row.composition);
    row.revision += 1;
  }

  return { api, simulateOtherTab };
}

/** A two-page PDF built in the browser, so the demo needs no file store. */
export function makeDemoPdfUrl(): string {
  const page = (title: string, lines: string[]) => {
    const text = [`BT /F1 20 Tf 72 720 Td (${title}) Tj ET`]
      .concat(lines.map((l, i) => `BT /F1 12 Tf 72 ${680 - i * 24} Td (${l}) Tj ET`))
      .join("\n");
    return text;
  };
  const streams = [
    page("Services Agreement", [
      "This agreement is made between the Provider and the Client.",
      "Name: ______________________________",
      "The Client agrees to the terms set out on the following page.",
      "",
      "Signature: ______________________   Date: ____________",
      "",
      "Initial here (initial)",
    ]),
    page("Schedule A", ["Fees are due within thirty days.", "", "Signature: ______________________   Date: ____________"]),
  ];
  const objs: string[] = [];
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push("<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>");
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>");
  objs.push(`<< /Length ${streams[0].length} >>\nstream\n${streams[0]}\nendstream`);
  objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>");
  objs.push(`<< /Length ${streams[1].length} >>\nstream\n${streams[1]}\nendstream`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return URL.createObjectURL(new Blob([body], { type: "application/pdf" }));
}
