/**
 * THE BUILDER REPAIRS ITS OWN OUTPUT, AND RECORD LISTS SORT (lane AI, social planner live test v0.4.3010).
 * The first build was refused at save after a refresh and sat on "Fix it" for five minutes; the history
 * read "Not saved" beside a saved card; All Posts was a hand-built <table> whose Brand header sorted
 * nothing; a date was a text box; the pipeline spelled "Assets Ready" against the table's "Assets ready".
 */
import { handBuiltTables, misspelledChoices } from "./applet-code-checks";
import { BuildRefused, coerceBuildAnswer, dateFieldsAsText, repairs } from "./build-applet";
import { checkBuildAnswer } from "./check-build-answer";
import { fixLabel, previewLine, requestOutcome, type BuildEntry } from "./build-session";

const POSTS = {
  alias: "posts",
  new_table: {
    name: "Posts",
    title_field: "title",
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["Idea", "Planned", "Assets ready", "Posted"] },
      { key: "post_date", label: "Post date", type: "date" },
    ],
  },
};

function answerWith(source: string) {
  const raw = {
    applet: {
      name: "Planner",
      entry: "App.tsx",
      files: [{ name: "App.tsx", source }],
      pages: [{ path: "/", title: "Posts", file: "App.tsx" }],
      sources: [POSTS],
      mandates: [],
    },
    note: "",
  };
  return { raw, answer: coerceBuildAnswer(raw) };
}

const HAND_TABLE = `import { useRows } from "@ai-matrx/applets/react";
export default function App() {
  const posts = useRows("posts");
  return <table><thead><tr><th onClick={() => {}}>Brand</th></tr></thead><tbody>{posts.rows.map((r) => <tr key={r._id}><td>{r.title}</td></tr>)}</tbody></table>;
}`;

describe("record lists are the platform table", () => {
  it("a file that reads rows and draws its own <table> is refused, pointing at RecordTable", () => {
    expect(handBuiltTables({ name: "App.tsx", source: HAND_TABLE })).toBe(true);
    const { raw, answer } = answerWith(HAND_TABLE);
    expect(() => checkBuildAnswer(raw, answer)).toThrow(/draws its own <table> of rows — use <RecordTable/);
  });
  it("RecordTable passes", () => {
    const ok = `import { useRows, RecordTable } from "@ai-matrx/applets/react";
export default function App() { const posts = useRows("posts"); return <RecordTable source="posts" rows={posts.rows} columns={["title", "status", "post_date"]} />; }`;
    expect(handBuiltTables({ name: "App.tsx", source: ok })).toBe(false);
  });
});

describe("a date is never a text box", () => {
  it("names a date field bound to a plain Field, passes the date control and RecordField", () => {
    const text = `<Field value={form.post_date} onChange={(e) => set("post_date", e.target.value)} placeholder="YYYY-MM-DD" />`;
    const files = (source: string) => ({ files: [{ name: "Form.tsx", source }], sources: [POSTS] });
    expect(dateFieldsAsText(files(text))).toEqual(["post_date"]);
    expect(dateFieldsAsText(files(`<Field type="date" value={form.post_date} onChange={set} />`))).toEqual([]);
    expect(dateFieldsAsText(files(`<RecordField source="posts" field="post_date" value={form.post_date} onValueChange={set} />`))).toEqual([]);
  });
});

describe("one spelling per choice", () => {
  it("names a status COMPARED or WRITTEN in another case, never a display word", () => {
    const pipeline = `const column = posts.rows.filter((p) => p.status === "Assets Ready"); const icon = { tiktok: "x" }["tiktok"];`;
    expect(misspelledChoices({ files: [{ name: "Pipeline.tsx", source: pipeline }], sources: [POSTS] })).toEqual([{ alias: "posts", key: "status", wrote: "Assets Ready", choice: "Assets ready" }]);
    expect(misspelledChoices({ files: [{ name: "Pipeline.tsx", source: `const S = ["Idea", "Assets Ready"]; const n = <h2>Assets Ready</h2>;` }], sources: [POSTS] })).toEqual([]);
    expect(misspelledChoices({ files: [{ name: "Pipeline.tsx", source: `posts.rows.filter((p) => p.status === "Assets ready");` }], sources: [POSTS] })).toEqual([]);
  });
});

describe("every refusal of her request goes to the automatic fix round", () => {
  it("repairs a refusal of her request, never a refused fix round (no loop), never a plain failure", () => {
    const refusal = new BuildRefused("Not saved: x.", answerWith(HAND_TABLE).answer.applet);
    expect(repairs({ fix: null }, refusal)).toBe(true);
    expect(repairs({ fix: { where: "record", message: "x" } }, refusal)).toBe(false);
    expect(repairs({ fix: null }, new Error("network"))).toBe(false);
  });

});

describe("one state for the history, the card and the header", () => {
  const entry = (over: Partial<BuildEntry>): BuildEntry => ({ id: "e", text: "A planner", fix: null, conversation_id: null, started_at: "", state: "saved", ...over });

  it("a refused request saved by its fix round reads as that save, never Not saved", () => {
    const requests = [entry({ id: "1", state: "refused" }), entry({ id: "2", text: "Fix this error", fix: { where: "record", message: "x" }, state: "saved", version: 1 })];
    expect(requestOutcome(requests, 0)).toEqual({ label: "Fixed · Saved v1", tone: "success" });
    expect(requestOutcome(requests, 1)).toEqual({ label: "Saved v1", tone: "success" });
  });
  it("while its fix round runs it reads Fixing; refused with no fix it reads Not saved", () => {
    expect(requestOutcome([entry({ state: "refused" }), entry({ fix: { where: "r", message: "x" }, state: "running" })], 0).label).toBe("Fixing");
    expect(requestOutcome([entry({ state: "refused" })], 0).label).toBe("Not saved");
  });
  it("the held fix button reads Fix it to use it on a draft; the header says it is a preview that holds what she adds", () => {
    expect(fixLabel("draft")).toBe("Fix it to use it");
    expect(fixLabel(null)).toBe("Fix it to use it");
    expect(fixLabel("published")).toBe("Fix it");
    expect(previewLine("v2")).toBe("Preview of v2 · what you add here is held, never saved");
    expect(previewLine(null)).toBe("Preview · what you add here is held, never saved");
    // One story: the card says Draft or Published; the preview header never restates it.
    expect(previewLine("v2")).not.toMatch(/Published|Draft/);
  });
});
