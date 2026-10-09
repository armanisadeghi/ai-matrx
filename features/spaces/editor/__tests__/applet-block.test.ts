// The Applet block (Embeds › Applet) through every boundary it crosses without a browser: the editor's store
// boundary (convert.ts) both ways, the snapshot validator, the Markdown export, and the pasted-link reader.

import { validateSnapshot } from "@/lib/spaces-blocks/schema";
import { DEFAULT_PAGE_SETTINGS, type SpaceBlock } from "@/lib/spaces-blocks/types";

import { blocksToMarkdownLines, type MarkdownContext } from "../../io/markdown";
import { fromEngine, toEngine, type EngineBlock } from "../convert";
import { appletSlugOf } from "../PasteUrlMenu";

const APPLET = "3f2a9c4e-8b1d-4c7a-9e0f-1a2b3c4d5e6f";
const blocks: SpaceBlock[] = [
  { id: "t1", type: "text", text: [{ text: "Our booking desk" }] },
  { id: "a1", type: "applet", props: { appletId: APPLET, height: 640 } },
  { id: "a2", type: "applet", props: { appletId: APPLET } },
];
const snap = (b: SpaceBlock[]) => ({ v: 1, settings: { ...DEFAULT_PAGE_SETTINGS }, icon: null, cover: null, blocks: b });
const through = (b: SpaceBlock[]) => fromEngine(JSON.parse(JSON.stringify(toEngine(b))) as EngineBlock[]);

describe("applet block", () => {
  it("round-trips unchanged through the editor's store boundary and stays a valid snapshot", () => {
    const out = through(blocks);
    expect(out).toEqual(blocks);
    expect(validateSnapshot(snap(out))).toEqual([]);
    expect(through(out)).toEqual(out);
  });

  it("a block without a real Applet id is refused before it is saved", () => {
    expect(validateSnapshot(snap([{ id: "a", type: "applet", props: { appletId: "" } }])).length).toBeGreaterThan(0);
    expect(validateSnapshot(snap([{ id: "a", type: "applet", props: { appletId: APPLET, height: -5 } }])).length).toBeGreaterThan(0);
  });

  const ctx: MarkdownContext = { titleOf: () => "", hrefOf: (id) => `/spaces/${id}` };
  it("exports as a link to the Applet on the web when its name is known", () => {
    const lines = blocksToMarkdownLines([blocks[1]], { ...ctx, appletOf: (id) => (id === APPLET ? { name: "Booking desk", slug: "booking-desk" } : null) });
    expect(lines).toEqual(["[Applet: Booking desk](https://www.aimatrx.com/applets/booking-desk)"]);
  });

  it("exports as a plain note when the Applet could not be read", () => {
    expect(blocksToMarkdownLines([blocks[1]], ctx)).toEqual(["*Applet (opens only in AI Matrx)*"]);
  });

  it("reads an Applet slug only from our own /applets/<slug> links", () => {
    expect(appletSlugOf("https://www.aimatrx.com/applets/booking-desk", "x.localhost:3001")).toBe("booking-desk");
    expect(appletSlugOf("https://aimatrx.com/applets/booking-desk/", "x.localhost:3001")).toBe("booking-desk");
    expect(appletSlugOf("http://x.localhost:3001/applets/booking-desk", "x.localhost:3001")).toBe("booking-desk");
    expect(appletSlugOf("https://www.aimatrx.com/applets/manage", "x")).toBeNull();
    expect(appletSlugOf("https://www.aimatrx.com/applets/build", "x")).toBeNull();
    expect(appletSlugOf("https://www.aimatrx.com/applets/booking-desk/run", "x")).toBeNull();
    expect(appletSlugOf("https://evil.example/applets/booking-desk", "x")).toBeNull();
    expect(appletSlugOf("https://www.aimatrx.com/spaces/booking-desk", "x")).toBeNull();
  });
});
