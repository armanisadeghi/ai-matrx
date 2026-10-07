// BYTES ARE SACRED — edit in place, per host.
//
// For every host the rule is the same: opening the editor and cancelling, or
// saving with no change, writes NOTHING; a one-word edit writes exactly that
// word. Each host is driven through THE session (`in-place-session.ts`) with
// its own write adapter — the real persistence function where it is pure
// (study guide splice-save, chat message merge), the host callback otherwise.
//
// Red first: `bytesViolations` is run against a planted naive session (it
// writes on every save and every cancel, as a hand-rolled host would) and must
// report violations — the same checks that pass for the real session.

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

import { createInPlaceSession, type InPlaceSaveMode, type InPlaceSessionOptions, type InPlaceSession } from "@ai-matrx/rich-editor/in-place/in-place-session";
import { spliceSaveBody, type VersionedBodyStore } from "@/features/rich-document/annotations/sourceSave";
import { mergeEditedText } from "@ai-matrx/chat/agents/redux/execution-system/message-crud/content-blocks.util";

const STORED = [
  "# Field notes",
  "",
  "The **quick** brown fox jumps over the lazy dog.",
  "",
  "- first item",
  "- second item",
  "",
  "```matrx",
  '{"__kind":"reference","id":"r1"}',
  "```",
  "",
].join("\n");
const ONE_WORD = STORED.replace("lazy", "sleepy");

type Factory = (options: InPlaceSessionOptions) => InPlaceSession;

/** Runs the four byte checks for one host; returns what went wrong (empty = sacred). */
async function bytesViolations(factory: Factory, mode: InPlaceSaveMode, persisted: () => string[], reset: () => void, write: (text: string) => Promise<unknown> | unknown) {
  const problems: string[] = [];
  const open = () => factory({ openedOn: STORED, mode, write: async (t) => void (await write(t)) });

  reset();
  let s = open();
  await s.draft(STORED);
  await s.cancel();
  if (persisted().length) problems.push(`open + cancel wrote ${persisted().length}x`);

  reset();
  s = open();
  await s.save(STORED);
  if (persisted().length) problems.push(`save with no change wrote ${persisted().length}x`);

  reset();
  s = open();
  await s.draft(ONE_WORD);
  await s.save(ONE_WORD);
  const writes = persisted();
  if (writes.length !== 1) problems.push(`one-word edit wrote ${writes.length}x`);
  else if (writes[0] !== ONE_WORD) problems.push("one-word edit wrote other bytes");

  if (mode === "autosave") {
    reset();
    s = open();
    await s.draft(ONE_WORD);
    await s.draft(ONE_WORD);
    await s.cancel();
    const after = persisted();
    // The edit was autosaved once; discarding puts the opened bytes back once.
    if (after.length !== 2 || after[0] !== ONE_WORD || after[1] !== STORED) problems.push(`autosave edit + discard wrote ${JSON.stringify(after.length)}x`);
  }
  return problems;
}

/** A word-level diff: the words that differ between a and b. */
function changedWords(a: string, b: string): { from: string[]; to: string[] } {
  const wa = a.split(/(\s+)/);
  const wb = b.split(/(\s+)/);
  const from: string[] = [];
  const to: string[] = [];
  for (let i = 0; i < Math.max(wa.length, wb.length); i++) {
    if (wa[i] !== wb[i]) {
      if (wa[i] !== undefined) from.push(wa[i]!);
      if (wb[i] !== undefined) to.push(wb[i]!);
    }
  }
  return { from, to };
}

/** The naive host: writes on every save and every cancel (what the session prevents). */
const naiveFactory: Factory = ({ openedOn, write }) => ({
  draft: async () => undefined,
  save: async (text) => ({ wrote: true, stored: await write(text) }),
  cancel: async () => {
    await write(openedOn);
    return { wrote: true };
  },
  dirty: () => true,
});

describe("edit in place — bytes are sacred", () => {
  test("red first: the checks catch a naive host that writes on save-without-change and cancel", async () => {
    const log: string[] = [];
    const problems = await bytesViolations(naiveFactory, "explicit", () => log, () => (log.length = 0), (t) => log.push(t));
    expect(problems).toEqual(expect.arrayContaining(["open + cancel wrote 1x", "save with no change wrote 1x"]));
  });

  test("the one-word edit fixture differs by exactly one word", () => {
    expect(changedWords(STORED, ONE_WORD)).toEqual({ from: ["lazy"], to: ["sleepy"] });
  });

  // Explicit-save hosts whose write is the host's own callback (the buffer /
  // form / page owns persistence): the session decides whether it is called.
  test.each([
    ["markdown studio preview (studio buffer)", "explicit"],
    ["transcription cleanup output (page text)", "explicit"],
    ["notes Read, desktop (note autosave through onChange)", "autosave"],
    ["notes Read, phone (working copy edit)", "autosave"],
  ] as const)("%s", async (_host, mode) => {
    const log: string[] = [];
    const problems = await bytesViolations(createInPlaceSession, mode, () => log, () => (log.length = 0), (t) => log.push(t));
    expect(problems).toEqual([]);
  });

  test("task description: the write is one description patch carrying exactly the edited word", async () => {
    const patches: { description: string }[] = [];
    const write = (text: string) => patches.push({ description: text });
    const problems = await bytesViolations(createInPlaceSession, "explicit", () => patches.map((p) => p.description), () => (patches.length = 0), write);
    expect(problems).toEqual([]);
    expect(Object.keys(patches[0] ?? {})).toEqual(["description"]);
  });

  test("chat user message: the merged row changes only the edited word; attachments ride untouched", async () => {
    const image = { type: "image", url: "storage://chat/receipt.png" };
    const existing = [{ type: "text", text: STORED }, image];
    const rows: string[] = [];
    let lastRow: unknown = null;
    const write = (text: string) => {
      lastRow = mergeEditedText(existing, text);
      rows.push(JSON.stringify(lastRow));
    };
    const problems = await bytesViolations(
      createInPlaceSession,
      "explicit",
      () => rows.map((r) => (JSON.parse(r) as { text?: string }[])[0]?.text ?? ""),
      () => (rows.length = 0),
      write,
    );
    expect(problems).toEqual([]);
    const s = createInPlaceSession({ openedOn: STORED, mode: "explicit", write });
    await s.save(ONE_WORD);
    expect(lastRow).toEqual([{ type: "text", text: ONE_WORD }, image]);
  });

  test("study guide: splice-save writes the stored body with only the edited word changed, and nothing when unchanged", async () => {
    const writes: string[] = [];
    let row = { version: 4, body: STORED };
    const store: VersionedBodyStore = {
      noun: "note",
      write: async (body, expectedVersion, nextVersion) => {
        if (row.version !== expectedVersion) return { data: null, error: null };
        writes.push(body);
        row = { version: nextVersion, body };
        return { data: row, error: null };
      },
      current: async () => ({ data: row, error: null }),
    };
    const write = async (text: string) => {
      await spliceSaveBody({ body: STORED, version: 4 }, text, store);
    };
    const problems = await bytesViolations(createInPlaceSession, "explicit", () => writes, () => {
      writes.length = 0;
      row = { version: 4, body: STORED };
    }, write);
    expect(problems).toEqual([]);
    expect(changedWords(STORED, writes[0] ?? "")).toEqual({ from: ["lazy"], to: ["sleepy"] });
  });

  test("study guide title (inline): one label write with exactly the edited word; nothing on cancel or no change", async () => {
    const labels: string[] = [];
    const title = "Cell biology: the lazy mitochondria";
    const s1 = createInPlaceSession({ openedOn: title, mode: "explicit", write: (t) => void labels.push(t) });
    await s1.cancel();
    await s1.save(title);
    expect(labels).toEqual([]);
    const s2 = createInPlaceSession({ openedOn: title, mode: "explicit", write: (t) => void labels.push(t) });
    await s2.save(title.replace("lazy", "busy"));
    expect(labels).toEqual(["Cell biology: the busy mitochondria"]);
    expect(changedWords(title, labels[0]!)).toEqual({ from: ["lazy"], to: ["busy"] });
  });

  test("AI answer: the session never calls the answer save for an unchanged text", async () => {
    // saveAnswerEdit's own splice is proven in packages/chat …/save-answer-edit.test.ts;
    // here: the shared shell's gate in front of it.
    const calls: string[] = [];
    const problems = await bytesViolations(createInPlaceSession, "explicit", () => calls, () => (calls.length = 0), (t) => calls.push(t));
    expect(problems).toEqual([]);
  });
});
