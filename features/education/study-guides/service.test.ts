const readAllRows = jest.fn();
const requireUserId = jest.fn(() => "learner-1");
const notesCreate = jest.fn();
const notesGetById = jest.fn();
const hydrateNoteContextLinks = jest.fn(async (rows) => rows);
const associationAdd = jest.fn();
const associationListForEntity = jest.fn();
const associationListForTargetsVisible = jest.fn();
const schema = jest.fn();

jest.mock("@ai-matrx/data/db", () => ({ readAllRows }));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId }));
jest.mock("@/features/notes/service/notesApi", () => ({
  NotesAPI: { create: notesCreate, getById: notesGetById },
}));
jest.mock("@/features/notes/service/noteContextAssociations", () => ({
  hydrateNoteContextLinks,
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    add: associationAdd,
    listForEntity: associationListForEntity,
    listForTargetsVisible: associationListForTargetsVisible,
  },
}));
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema } }));

import {
  loadStudyAnnotations,
  saveStudyAnnotation,
} from "./service";
import type { Note } from "@/features/notes/types";

const annotationInput = {
  noteId: "guide-1",
  noteTitle: "Guide",
  quote: "A selected passage",
  kind: "highlight" as const,
  organizationId: "org-1",
};

interface RecordedQuery {
  select(...args: unknown[]): RecordedQuery;
  in(...args: unknown[]): RecordedQuery;
  eq(...args: unknown[]): RecordedQuery;
  is(...args: unknown[]): RecordedQuery;
  not(...args: unknown[]): RecordedQuery;
  order(...args: unknown[]): RecordedQuery;
  range(...args: unknown[]): Promise<{ data: unknown[]; error: null }>;
}

function annotationNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "annotation-1",
    created_by: "learner-1",
    organization_id: "org-1",
    label: "Highlight: Guide",
    content: "A selected passage",
    content_hash: null,
    created_at: "2026-09-20T00:00:00.000Z",
    deleted_at: null,
    file_path: null,
    folder_id: null,
    folder_name: "Study annotations",
    last_device_id: null,
    metadata: { studyAnnotation: { kind: "highlight", quote: "A selected passage" } },
    position: null,
    project_id: null,
    sync_version: 1,
    tags: [],
    task_id: null,
    updated_at: "2026-09-20T00:00:00.000Z",
    updated_by: null,
    version: 1,
    visibility: "personal",
    ...overrides,
    custom_fields: overrides.custom_fields ?? {},
  };
}

function queryRecorder(rows: unknown[] = []) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const query: RecordedQuery = {
    select: (...args) => { calls.push({ method: "select", args }); return query; },
    in: (...args) => { calls.push({ method: "in", args }); return query; },
    eq: (...args) => { calls.push({ method: "eq", args }); return query; },
    is: (...args) => { calls.push({ method: "is", args }); return query; },
    not: (...args) => { calls.push({ method: "not", args }); return query; },
    order: (...args) => { calls.push({ method: "order", args }); return query; },
    range: async (...args) => {
      calls.push({ method: "range", args });
      return { data: rows, error: null };
    },
  };
  return { query, calls };
}

beforeEach(() => {
  jest.clearAllMocks();
  requireUserId.mockReturnValue("learner-1");
  notesCreate.mockResolvedValue(annotationNote());
  notesGetById.mockResolvedValue(null);
  associationAdd.mockResolvedValue({ ok: true });
  associationListForEntity.mockResolvedValue({ ok: true, data: { edges: [] } });
  readAllRows.mockImplementation(async (loadPage) => {
    const result = await loadPage({ from: 0, to: 999 });
    if (result.error) throw result.error;
    return result.data ?? [];
  });
});

describe("study guide annotations", () => {
  it("refuses a missing organization before creating a note or association", async () => {
    await expect(saveStudyAnnotation({ ...annotationInput, organizationId: "" })).rejects.toThrow(/organization/i);

    expect(notesCreate).not.toHaveBeenCalled();
    expect(associationAdd).not.toHaveBeenCalled();
  });

  it("preserves the saved annotation in a typed error and retries its link without a second create", async () => {
    const saved = annotationNote();
    notesCreate.mockResolvedValue(saved);
    associationAdd.mockResolvedValueOnce({ ok: false, error: new Error("link unavailable") });

    await expect(saveStudyAnnotation(annotationInput)).rejects.toMatchObject({
      name: "StudyAnnotationLinkError",
      note: { id: saved.id },
    });
    expect(notesCreate).toHaveBeenCalledTimes(1);

    notesGetById.mockResolvedValue(saved);
    await expect(saveStudyAnnotation({ ...annotationInput, existingAnnotationId: saved.id })).resolves.toBe(saved);
    expect(notesCreate).toHaveBeenCalledTimes(1);
    expect(notesGetById).toHaveBeenCalledWith(saved.id, { failureMode: "throw" });
    expect(associationAdd).toHaveBeenCalledTimes(2);
  });
});

describe("study guide annotation reads", () => {
  it("always restricts linked annotation notes to the authenticated creator", async () => {
    associationListForEntity.mockResolvedValue({
      ok: true,
      data: { edges: [{ direction: "incoming", otherType: "note", role: "source", otherId: "annotation-1" }] },
    });
    const recorded = queryRecorder();
    schema.mockReturnValue({ from: jest.fn(() => recorded.query) });

    await loadStudyAnnotations("guide-1");

    expect(recorded.calls).toContainEqual({ method: "eq", args: ["created_by", "learner-1"] });
  });

  it("refuses to reuse a saved annotation for a different passage", async () => {
    notesGetById.mockResolvedValue(annotationNote());
    await expect(saveStudyAnnotation({
      ...annotationInput,
      quote: "A different passage",
      existingAnnotationId: "annotation-1",
    })).rejects.toThrow(/no longer matches/);
    expect(notesCreate).not.toHaveBeenCalled();
    expect(associationAdd).not.toHaveBeenCalled();
  });
});
