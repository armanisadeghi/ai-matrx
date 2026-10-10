/**
 * GUARD — a kit run whose tab died after an artifact was created adopts it.
 *
 * The class (2026-10-09, deck first): the kit page reloads between an
 * artifact's create and its kit edge; the artifact is left outside the kit and
 * the resumed run makes a second one. Every generator that creates an artifact
 * stamps the run's key on it and its writer returns the earlier one: study_media
 * (summary / mind map / memory aid / audio), assessment (quiz / practice test)
 * and notes. The decks are covered in flashcards/data/__tests__.
 */

import { readFileSync } from "fs";
import { join } from "path";

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(), rpc: jest.fn() },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn(async (explicit?: string) => explicit ?? "org-1"),
}));

import { supabase } from "@/utils/supabase/client";
import { studyMediaService } from "@/features/education/media/service";
import { assessmentService } from "@/features/education/assessment/data/assessmentService";
import { findNoteByRunKey } from "@/features/notes/service/notesService";
import { singleArtifactRunKey, withRunKey } from "../runKey";

const KEY = "kit-1:1000|summary:abc:3:10";

/** A PostgREST-shaped chain: every builder returns itself, reads resolve `rows`. */
function table(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is", "in", "neq", "order", "limit", "insert"]) {
    chain[m] = jest.fn(() => chain);
  }
  chain.single = jest.fn(async () => ({ data: { id: "inserted" }, error: null }));
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  (supabase.schema as jest.Mock).mockReturnValue(chain);
  return chain;
}

afterEach(() => jest.restoreAllMocks());

describe("study media (summary, mind map, memory aid, audio)", () => {
  const made = { id: "media-made", title: "Biology", media_kind: "summary" };

  it("returns the run's earlier artifact and inserts nothing", async () => {
    const chain = table([made]);
    const res = await studyMediaService.create({ mediaKind: "summary", title: "Biology", runKey: KEY });
    expect(res.data?.id).toBe("media-made");
    expect(chain.insert).not.toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("config->>run_key", KEY);
  });

  it("stamps the run key on a first create", async () => {
    const chain = table([]);
    await studyMediaService.create({ mediaKind: "summary", title: "Biology", runKey: KEY });
    const row = (chain.insert as jest.Mock).mock.calls[0][0];
    expect(row.config).toMatchObject({ run_key: KEY });
  });

  it("a create without a run key never looks for an earlier artifact", async () => {
    const chain = table([made]);
    const res = await studyMediaService.create({ mediaKind: "summary", title: "Biology" });
    expect(chain.insert).toHaveBeenCalledTimes(1);
    expect(res.data?.id).toBe("inserted");
  });
});

describe("assessments (quiz, practice test)", () => {
  const made = { id: "as-made", title: "Biology", metadata: { run_key: KEY } };
  const ITEMS = [
    { questionType: "short_answer", prompt: "Q1" },
    { questionType: "short_answer", prompt: "Q2" },
  ] as never[];
  const input = { assessmentKind: "quiz", title: "Biology", runKey: KEY } as never;

  it("returns the run's earlier assessment complete as is and creates nothing", async () => {
    const chain = table([made]);
    jest.spyOn(assessmentService, "getAssessmentWithItems").mockResolvedValue({
      data: { assessment: made, items: [{ id: "i1" }, { id: "i2" }] },
      error: null,
    } as never);
    const add = jest.spyOn(assessmentService, "addItems");
    const create = jest.spyOn(assessmentService, "createAssessment");
    const res = await assessmentService.createWithItems(input, ITEMS);
    expect(res.data?.assessment.id).toBe("as-made");
    expect(create).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("metadata->>run_key", KEY);
  });

  it("writes only the questions a half-made assessment is missing", async () => {
    table([made]);
    jest.spyOn(assessmentService, "getAssessmentWithItems").mockResolvedValue({
      data: { assessment: made, items: [{ id: "i1" }] },
      error: null,
    } as never);
    const add = jest.spyOn(assessmentService, "addItems").mockResolvedValue({ data: [{ id: "i2" }], error: null } as never);
    const create = jest.spyOn(assessmentService, "createAssessment");
    const res = await assessmentService.createWithItems(input, ITEMS);
    expect(create).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith("as-made", [ITEMS[1]], { startPosition: 1 });
    expect(res.data?.items).toHaveLength(2);
  });

  it("stamps the run key on a first create", async () => {
    const chain = table([]);
    await assessmentService.createAssessment(input);
    const row = (chain.insert as jest.Mock).mock.calls[0][0];
    expect(row.metadata).toMatchObject({ run_key: KEY });
  });
});

describe("notes", () => {
  it("looks a run's note up by its stamped key, in the run's organization", async () => {
    const chain = table([]);
    const found = await findNoteByRunKey("org-1", KEY);
    expect(found).toBeNull();
    expect(chain.eq).toHaveBeenCalledWith("metadata->>run_key", KEY);
    expect(chain.eq).toHaveBeenCalledWith("organization_id", "org-1");
  });
});

describe("the run key itself", () => {
  it("stamps only when there is a key", () => {
    expect(withRunKey({ a: 1 }, KEY)).toEqual({ a: 1, run_key: KEY });
    expect(withRunKey({ a: 1 }, null)).toEqual({ a: 1 });
  });
  it("a one-click convert (no kit run) has no key, so it never adopts", () => {
    expect(singleArtifactRunKey(undefined, "audio")).toBeNull();
    expect(singleArtifactRunKey({ runScope: "kit-1:1000" }, "audio")).toBe("kit-1:1000|audio");
  });
});

describe("every generator that creates an artifact passes the run key to its writer", () => {
  const root = join(__dirname, "..", "..");
  const cases: Array<[string, RegExp]> = [
    ["convert/generators/summary.ts", /studyMediaService\.create\(\{[^}]*runKey:/s],
    ["convert/generators/mindMap.ts", /studyMediaService\.create\(\{[^}]*runKey:/s],
    ["convert/generators/memoryAid.ts", /studyMediaService\.create\(\{[^}]*runKey:/s],
    ["media/audio/audioGenerator.ts", /studyMediaService\.create\(\{[^}]*runKey/s],
    ["assessment/data/quizGenerator.ts", /createWithItems\(\s*\{[^]*?runKey:/],
    ["notes/notesGenerator.ts", /NotesAPI\.createForRun\(/],
    ["convert/generators/deck.ts", /runKey: covered\.runKey/],
  ];
  it.each(cases)("%s", (file, pattern) => {
    expect(readFileSync(join(root, file), "utf8")).toMatch(pattern);
  });
});
