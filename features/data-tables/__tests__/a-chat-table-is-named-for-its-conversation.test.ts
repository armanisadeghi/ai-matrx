// A CHAT TABLE IS NAMED FOR ITS CONVERSATION, NEVER "TABLE 1" (lane HANDOVER, 2026-09-28).
//
// Cedar Ridge Physical Therapy asked the chat for home exercises after knee surgery and made the
// answer a live table. The answer had no heading, the canvas had titled the table "Table 1", and
// that placeholder became the table's name in the clinic's data. A placeholder is now no name, and
// the conversation's own title ("Post-Knee Surgery Home Exercises") is the next rung.

const rows: Record<string, Record<string, unknown>> = {
  message: { conversation_id: "c0000000-0000-4000-8000-000000000001", content: [] },
  conversation: { title: "Post-Knee Surgery Home Exercises" },
};

jest.mock("@/utils/supabase/client", () => {
  const chain = (table: string) => {
    const q = {
      select: () => q,
      is: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
    };
    return q;
  };
  return { supabase: { schema: () => ({ from: (table: string) => chain(table) }) } };
});
jest.mock("@/features/cx-chat/utils/cx-content-converter", () => ({
  convertCxContentToDisplay: () => ({ content: "Here you go.\n\n| Exercise | Sets |\n|---|---|\n| Quad sets | 3 |" }),
}));

import { deriveDatasetNameForChatTable, isPlaceholderTableTitle } from "../derive-dataset-name";

it("a placeholder title gives way to the conversation's title", async () => {
  const name = await deriveDatasetNameForChatTable({
    sourceMessageId: "m0000000-0000-4000-8000-000000000001",
    canvasItemId: "a0000000-0000-4000-8000-000000000001",
    artifactTitle: "Table 1",
    tableMarkdown: "| Exercise | Sets |\n|---|---|\n| Quad sets | 3 |",
    headers: ["Exercise", "Sets"],
  });
  expect(name).toBe("Post-Knee Surgery Home Exercises");
});

it("a real title still wins, and only 'Table' / 'Table N' count as placeholders", async () => {
  expect(isPlaceholderTableTitle("Table 1")).toBe(true);
  expect(isPlaceholderTableTitle("table")).toBe(true);
  expect(isPlaceholderTableTitle("Table of home exercises")).toBe(false);
  const name = await deriveDatasetNameForChatTable({
    sourceMessageId: "m0000000-0000-4000-8000-000000000001",
    canvasItemId: "a0000000-0000-4000-8000-000000000001",
    artifactTitle: "Balance exercises",
    tableMarkdown: "| Exercise | Sets |\n|---|---|\n| Quad sets | 3 |",
    headers: ["Exercise", "Sets"],
  });
  expect(name).toBe("Balance exercises");
});
