// Round 40: the route reads every page a Space links to in ONE call, so the id walk must find each link
// wherever the stored blocks keep it — a sub-page row's props, a nested block, and an inline mention whose
// target sits inside the span's JSON string (escaped once more by the stored snapshot).
import { linkedPageIds } from "../linked-pages";
import type { SpaceBlock } from "../../contract";

const A = "0f5e6a8c-1b2d-4e3f-8a9b-0c1d2e3f4a5b";
const B = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const C = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const SELF = "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f";

const blocks = [
  { id: "b1", type: "page", props: { spaceId: A } },
  {
    id: "b2",
    type: "toggle",
    children: [{ id: "b3", type: "linkToPage", props: { spaceId: B } }],
  },
  {
    id: "b4",
    type: "paragraph",
    text: [{ text: "see", mention: { kind: "space", spaceId: C } }],
    props: { span: JSON.stringify({ text: "Clients OS", mention: { kind: "space", spaceId: C } }) },
  },
  { id: "b5", type: "page", props: { spaceId: A } },
  { id: "b6", type: "linkToPage", props: { spaceId: SELF } },
] as unknown as SpaceBlock[];

describe("linkedPageIds", () => {
  it("finds row, nested and mention links once each, never the page itself", () => {
    expect(linkedPageIds(blocks, SELF).sort()).toEqual([A, B, C].sort());
  });

  it("finds a mention stored only inside an escaped span string", () => {
    const onlySpan = [{ id: "m", type: "paragraph", props: { span: JSON.stringify({ mention: { kind: "space", spaceId: B } }) } }] as unknown as SpaceBlock[];
    expect(linkedPageIds(onlySpan)).toEqual([B]);
  });

  it("asks nothing for a page with no links", () => {
    expect(linkedPageIds([{ id: "p", type: "paragraph", text: [{ text: "hello" }] }] as unknown as SpaceBlock[])).toEqual([]);
  });
});
