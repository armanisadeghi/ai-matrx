const mockReadAllRows = jest.fn();
const requireUserId = jest.fn(() => "learner-1");
const notesCreate = jest.fn();
const notesGetById = jest.fn();
const hydrateNoteContextLinks = jest.fn(async (rows) => rows);
const associationAdd = jest.fn();
const associationListForEntity = jest.fn();
const associationListForTargetsVisible = jest.fn();
const schema = jest.fn();

jest.mock("@ai-matrx/data/db", () => ({ readAllRows: mockReadAllRows }));
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
  loadStudyGuideIndex,
} from "./service";
import { STUDY_NOTES_FOLDER } from "@/features/education/notes/study-notes-folder";
import type { Note } from "@/features/notes/types";

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
    metadata: {},
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
    custom_fields: overrides.custom_fields ?? { studyAnnotation: { kind: "highlight", quote: "A selected passage" } },
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
  mockReadAllRows.mockImplementation(async (loadPage) => {
    const result = await loadPage({ from: 0, to: 999 });
    if (result.error) throw result.error;
    return result.data ?? [];
  });
});

describe("study guide library", () => {
  it("lists only my study-folder notes — an ordinary draft is not a study guide", async () => {
    const recorded = queryRecorder([]);
    schema.mockReturnValue({ from: jest.fn(() => recorded.query) });

    await loadStudyGuideIndex();

    expect(recorded.calls).toContainEqual({ method: "eq", args: ["created_by", "learner-1"] });
    expect(recorded.calls).toContainEqual({ method: "eq", args: ["folder_name", STUDY_NOTES_FOLDER] });
  });
});
