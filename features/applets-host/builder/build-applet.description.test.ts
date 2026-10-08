/**
 * THE APPLET'S DESCRIPTION IS WHAT IT IS, NEVER A FIX NOTE (final live test of v0.4.3018, 2026-10-08,
 * build ded6099b): after an automatic repair the builder card read "Fixed import locations for RecordTable…"
 * where the Applet's description belongs. The description is saved from the build, a repair that answers
 * without one keeps it, and the saved row the card reads carries it.
 */
import { SAVED_APPLET_COLUMNS, saveBuiltApplet, type BuilderApplet } from "./build-applet";

type Sent = Record<string, unknown>;

function fakeClient(sent: Sent[]) {
  const chain = {
    update: (content: Sent) => {
      sent.push(content);
      return chain;
    },
    eq: () => chain,
    select: (columns: string) => {
      sent.push({ __columns: columns });
      return chain;
    },
    single: async () => ({ data: { id: "a1", slug: "social-post-planner", name: "Social Post Planner", description: sent[0]?.description ?? null }, error: null }),
  };
  return { schema: () => ({ from: () => chain }) } as never;
}

const current: BuilderApplet = {
  name: "Social Post Planner",
  slug: "social-post-planner",
  description: "Planner for social media posts tracking reuse across TikTok, Instagram, and YouTube.",
  entry: "index.tsx",
  files: [{ name: "index.tsx", source: "export default function App() { return null; }" }],
  pages: [{ path: "/", title: "Pipeline", file: "index.tsx" }],
  sources: [],
  mandates: [],
} as unknown as BuilderApplet;

it("the saved row carries the description the card shows", () => {
  expect(SAVED_APPLET_COLUMNS.split(", ")).toContain("description");
});

it("a repair answered without a description keeps the Applet's own, never the fix note", async () => {
  const sent: Sent[] = [];
  const repaired = { applet: { ...current, description: "" }, note: "Fixed import locations for RecordTable, RecordField, WritingBox." };
  await saveBuiltApplet(fakeClient(sent), {
    organizationId: "org-1",
    appletId: "a1",
    current,
    answer: repaired as never,
    request: "Fix this error",
    conversationId: null,
  });
  expect(sent[0]?.description).toBe(current.description);
  expect(sent[0]?.description).not.toContain("Fixed import");
});
