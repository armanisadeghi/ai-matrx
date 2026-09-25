/**
 * @jest-environment jsdom
 *
 * RC-B11 — capture/paint alignment against rendered markdown, the mention
 * grammar, and the passage-write gate.
 *
 * WHAT BREAKS EACH TEST: a projection that maps rendered text by position in
 * textContent (it drifts on every `**`, link and formula); a renderer-invented
 * label (KaTeX, a copy button) dragging the cursor forward; a mention token
 * that notifies a malformed id; a passage write that reaches the network
 * while RC-A5 is unapplied.
 */

jest.mock("@/utils/supabase/client", () => ({ supabase: { rpc: jest.fn(), schema: jest.fn() } }));
jest.mock("@/features/scopes/host/associationsStore", () => ({
  associationsDataSource: { rpc: jest.fn() },
  getAssociationsStore: jest.fn(),
}));
jest.mock("@/features/scopes/service/associationsService", () => ({ associationsService: { add: jest.fn() } }));
jest.mock("@/lib/organizations/personalOrg", () => ({ ensureOrgId: jest.fn(async () => "org-1") }));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "u-1" }));

import { projectSource, rangeToSource, sourceToRanges } from "../projection";
import { mentionedUserIds, parseDateQuery, personMention, tokenizeMentions } from "../mentions";
import { ANCHOR_WRITES_ENABLED } from "../constants";
import { addComment, AnchorWritesOffError, createHighlight, linkRecord } from "../service";
import { associationsDataSource } from "@/features/scopes/host/associationsStore";
import { associationsService } from "@/features/scopes/service/associationsService";
import { buildTextAnchor } from "../anchor";

const SOURCE =
  "## Step 1\n\nOpen the **main valve** slowly, see [the manual](https://example.com) and $x^2$ rule.\n\nWalk every zone.";

function render(): HTMLElement {
  const root = document.createElement("div");
  // What the ONE renderer produces for SOURCE, plus chrome it invents.
  root.innerHTML =
    '<h2>Step 1<button>Copy</button></h2>' +
    '<p>Open the <strong>main valve</strong> slowly, see <a href="https://example.com">the manual</a> and ' +
    '<span class="katex"><span class="katex-mathml">x^2</span><span aria-hidden="true">x2</span></span> rule.</p>' +
    "<p>Walk every zone.</p>";
  document.body.appendChild(root);
  return root;
}

describe("projection — rendered text ⇄ source offsets", () => {
  it("captures a selection across formatting as the exact source range", () => {
    const root = render();
    const p = projectSource(root, SOURCE);
    const strong = root.querySelector("strong")!.firstChild!;
    const after = strong.parentElement!.nextSibling!; // " slowly, see "
    const range = document.createRange();
    range.setStart(root.querySelector("p")!.firstChild!, "Open the ".length);
    range.setEnd(after, " slowly".length);
    const mapped = rangeToSource(p, range)!;
    expect(SOURCE.slice(mapped.start, mapped.end)).toBe("**main valve** slowly");
  });

  it("paints a source range back onto the rendered words only", () => {
    const root = render();
    const p = projectSource(root, SOURCE);
    const start = SOURCE.indexOf("main valve");
    const ranges = sourceToRanges(p, start, start + "main valve** slowly".length);
    expect(ranges.map((r) => r.toString()).join("|")).toBe("main valve| slowly");
  });

  it("never lets invented chrome drag the cursor past real text", () => {
    const root = render();
    const p = projectSource(root, SOURCE);
    const texts = p.nodes.map((n) => n.node.data);
    expect(texts).not.toContain("Copy"); // a button is skipped outright
    expect(texts).not.toContain("x2"); // aria-hidden KaTeX output is skipped
    expect(texts).toContain("Walk every zone."); // still mapped after the formula
    const walk = p.nodes.find((n) => n.node.data === "Walk every zone.")!;
    expect(walk.sourceStart).toBe(SOURCE.indexOf("Walk every zone."));
  });
});

describe("mentions", () => {
  const id = "9f1c2d3e-4a5b-4c6d-8e7f-001122334455";
  it("round-trips people and dates and ignores malformed ids", () => {
    const body = `${personMention("Dana Ruiz", id)} can you check by @[Tue, Sep 30](date:2026-09-30)? @[x](user:not-a-uuid)`;
    const t = tokenizeMentions(body);
    expect(t.filter((x) => x.type === "person")).toEqual([{ type: "person", label: "Dana Ruiz", userId: id }]);
    expect(t.filter((x) => x.type === "date")).toEqual([{ type: "date", label: "Tue, Sep 30", iso: "2026-09-30" }]);
    expect(mentionedUserIds(body)).toEqual([id]);
  });

  it("parses the dates people type", () => {
    const now = new Date(2026, 8, 25); // Friday 25 Sep 2026
    expect(parseDateQuery("tomorrow", now)?.getDate()).toBe(26);
    expect(parseDateQuery("mon", now)?.getDate()).toBe(28);
    expect(parseDateQuery("next mon", now)?.getDate()).toBe(5);
    expect(parseDateQuery("sep 30", now)?.getMonth()).toBe(8);
    expect(parseDateQuery("2026-10-02", now)?.getDate()).toBe(2);
    expect(parseDateQuery("banana", now)).toBeNull();
  });
});

describe("the passage-write gate (RC-A5 unapplied)", () => {
  const source = { token: "document", id: "d-1", title: "Irrigation", body: SOURCE, contentVersion: 1 };
  const anchor = buildTextAnchor(SOURCE, SOURCE.indexOf("Walk"), SOURCE.indexOf("Walk") + 4, 1);

  it("is off in code until the register says RC-A5 is applied", () => {
    expect(ANCHOR_WRITES_ENABLED).toBe(false);
  });

  it("refuses every passage write before any request, with the plain sentence", async () => {
    await expect(addComment({ source, body: "hi", anchor })).rejects.toBeInstanceOf(AnchorWritesOffError);
    await expect(createHighlight({ source, anchor, color: "yellow", note: "" })).rejects.toBeInstanceOf(AnchorWritesOffError);
    await expect(linkRecord({ source, token: "task", id: "t-1", anchor })).rejects.toBeInstanceOf(AnchorWritesOffError);
    expect(associationsDataSource.rpc).not.toHaveBeenCalled();
    expect(associationsService.add).not.toHaveBeenCalled();
  });

  it("still lets a whole-document comment through the one comment seam", async () => {
    (associationsDataSource.rpc as jest.Mock).mockResolvedValueOnce({ data: "c-1", error: null });
    await expect(addComment({ source, body: "Looks good" })).resolves.toBe("c-1");
    const [fn, args] = (associationsDataSource.rpc as jest.Mock).mock.calls[0];
    expect(fn).toBe("cmt_add");
    expect(args).not.toHaveProperty("p_anchor"); // resolves on the old AND new door identity
  });
});
