/**
 * The three reads: a refusal is a sentence (never a success, never a throw),
 * only eligible rows are read, and an agent's ids resolve against the rows on
 * screen or refuse with nothing read.
 */

import type { ConnectedSourceRow } from "../types";

const mockComments = jest.fn();
const mockRevisions = jest.fn();
const mockDeck = jest.fn();
jest.mock("../api", () => ({
  readGoogleComments: (...args: unknown[]) => mockComments(...args),
  readGoogleRevisions: (...args: unknown[]) => mockRevisions(...args),
  readGooglePresentation: (...args: unknown[]) => mockDeck(...args),
}));

import { runSourceRead } from "./reads";
import { resolveReadRows } from "./surface";

const dispatch = jest.fn() as unknown as Parameters<typeof runSourceRead>[0];

function row(id: string, attributes: Record<string, unknown>): ConnectedSourceRow {
  return {
    id,
    external_id: id.split(":")[1] ?? id,
    adapter: "google_picked_files",
    kind: "document",
    title: `Title ${id}`,
    subtitle: null,
    url: null,
    author: null,
    created_at: null,
    modified_at: null,
    size_bytes: null,
    duration_seconds: null,
    container_id: null,
    attributes,
  };
}

const doc = row("google_picked_files:doc1", {
  connection_id: "conn",
  reads_comments: true,
  reads_revisions: true,
  reads_speaker_notes: false,
});
const mail = row("outlook_mail:m1", {});

beforeEach(() => {
  mockComments.mockReset();
  mockRevisions.mockReset();
  mockDeck.mockReset();
});

test("speaker notes on a document is a refusal, not a success", async () => {
  const outcome = await runSourceRead(dispatch, "slides", [doc]);
  expect(outcome.ok).toBe(false);
  expect(mockDeck).not.toHaveBeenCalled();
});

test("history reads only the eligible rows and counts the rest", async () => {
  mockRevisions.mockResolvedValue({ file_id: "doc1", revisions: [], truncated: false });
  const outcome = await runSourceRead(dispatch, "revisions", [doc, mail]);
  expect(outcome).toMatchObject({ ok: true, skipped: 1 });
  expect(mockRevisions).toHaveBeenCalledWith(dispatch, "conn", "doc1");
});

test("an agent's id that is not on screen refuses with nothing read", () => {
  expect(() => resolveReadRows(["google_picked_files:nope"], [doc])).toThrow("Not on screen");
  expect(() => resolveReadRows([], [doc])).toThrow("JSON array");
  expect(resolveReadRows([doc.id], [doc, mail])).toEqual([doc]);
});
