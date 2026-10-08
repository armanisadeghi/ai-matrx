/**
 * THE REFUSAL CHECKS NEVER BLOCK A VALID APPLET (lane AL, 2026-10-08). Each pair is a case a reviewer
 * proved the old regex checks refused, beside the true violation the check must still refuse. Every
 * check reads the syntax tree, so a word in a string, JSX text or a comment is never code.
 */
import { browserDialogs, deadButtons, fieldsWithNoInput, handBuiltTables, misspelledChoices, parseProblem } from "./applet-code-checks";
import { coerceBuildAnswer } from "./build-applet";
import { checkBuildAnswer } from "./check-build-answer";

const file = (source: string, name = "App.tsx") => ({ name, source });

describe("B-1 browserDialogs names only a real call of the browser's dialog", () => {
  it("passes the words confirm / alert / prompt in strings, JSX text and comments", () => {
    const src = `import { RecordField } from "@ai-matrx/applets/react";
// please confirm (y/n)
/* alert (later) */
export default function App() {
  const hint = "Set an alert (days)";
  return <div title="prompt (optional)"><RecordField label="Image prompt (optional)" />Set an alert (days) {hint}</div>;
}`;
    expect(browserDialogs(file(src))).toEqual([]);
  });
  it("passes a confirm the Applet imports or defines itself", () => {
    expect(browserDialogs(file(`import { confirmAction as confirm } from "@ai-matrx/applets/react";\nasync function del() { if (await confirm({ title: "Archive?" })) go(); }`))).toEqual([]);
    expect(browserDialogs(file(`function alert(msg: string) { toast(msg); }\nalert("Saved");`))).toEqual([]);
    expect(browserDialogs(file(`const prompt = (q) => ask(q);\nprompt("Name?");`))).toEqual([]);
  });
  it("still refuses window.confirm(, a bare global alert(, globalThis.prompt(", () => {
    expect(browserDialogs(file(`if (window.confirm("Delete this brand?")) remove();`))).toEqual(["confirm"]);
    expect(browserDialogs(file(`alert("Saved");`))).toEqual(["alert"]);
    expect(browserDialogs(file(`const name = globalThis.prompt("Name?");`))).toEqual(["prompt"]);
    expect(browserDialogs(file(`const ask = window["confirm"];`))).toEqual(["confirm"]);
  });
});

const POSTS = {
  alias: "posts",
  new_table: {
    name: "Posts",
    title_field: "title",
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "status", label: "Status", type: "select", options: ["draft", "scheduled"] },
    ],
  },
};
const choices = (source: string) => misspelledChoices({ files: [file(source)], sources: [POSTS as never] });

describe("B-2 misspelledChoices names a choice VALUE, never display text", () => {
  it("passes a label map and a heading", () => {
    expect(choices(`const L = { draft: "Draft", scheduled: "Scheduled" };\nexport default () => <section><h2>Scheduled</h2><p>{L[row.status]}</p></section>;`)).toEqual([]);
    expect(choices(`const opts = [{ value: "draft", label: "Draft" }];`)).toEqual([]);
  });
  it("refuses a comparison, a write, a switch case and an option value spelled otherwise", () => {
    expect(choices(`const late = rows.filter((r) => r.status === "Scheduled");`)).toEqual([{ alias: "posts", key: "status", wrote: "Scheduled", choice: "scheduled" }]);
    expect(choices(`posts.create({ title, status: "Draft" });`)).toEqual([{ alias: "posts", key: "status", wrote: "Draft", choice: "draft" }]);
    expect(choices(`function n(row) { switch (row.status) { case "Draft": return 1; } }`)).toEqual([{ alias: "posts", key: "status", wrote: "Draft", choice: "draft" }]);
    expect(choices(`<select><option value="Draft">Draft</option></select>`)).toEqual([{ alias: "posts", key: "status", wrote: "Draft", choice: "draft" }]);
    expect(choices(`set("status", "Scheduled");`)).toEqual([{ alias: "posts", key: "status", wrote: "Scheduled", choice: "scheduled" }]);
  });
});

describe("B-3 deadButtons sees what gives a button its job", () => {
  it("passes a button under an asChild trigger, in a form with onSubmit, a submit, in a Link, and handed as a prop", () => {
    const src = `export default function App() {
  return <div>
    <DialogTrigger asChild><Button>Add a post</Button></DialogTrigger>
    <form onSubmit={go}><Button>Save</Button></form>
    <Button type="submit">Send</Button>
    <Link to="/add"><Button>New</Button></Link>
    <ConfirmDialog trigger={<Button>Delete</Button>} />
  </div>;
}`;
    expect(deadButtons(file(src))).toEqual([]);
  });
  it("still refuses a button with no job, even next to a form that has none", () => {
    expect(deadButtons(file(`<div><Button variant="primary"><Plus /> New Post</Button></div>`))).toEqual(["New Post"]);
    expect(deadButtons(file(`<form><Button>Save</Button></form>`))).toEqual(["Save"]);
  });
});

describe("B-4 handBuiltTables names a sortable record list only", () => {
  it("passes a calendar grid and a pivot that RecordTable cannot draw", () => {
    const calendar = `const posts = useRows("posts");
export default () => <table><thead><tr>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead><tbody>{weeks.map((w) => <tr key={w[0]}>{w.map((d) => <td key={d}>{d}</td>)}</tr>)}</tbody></table>;`;
    expect(handBuiltTables(file(calendar))).toBe(false);
    const pivot = `const posts = useRows("posts");
export default () => <table><tr><th>Brand</th><th>Posted</th></tr><tr><td>Oak</td><td>{count}</td></tr></table>;`;
    expect(handBuiltTables(file(pivot))).toBe(false);
  });
  it("still refuses rows mapped one per <tr> under headers that look sortable", () => {
    const list = `const posts = useRows("posts");
export default () => <table><thead><tr><th>Title <ArrowUpDown /></th></tr></thead><tbody>{posts.rows.map((r) => <tr key={r._id}><td>{r.title}</td></tr>)}</tbody></table>;`;
    expect(handBuiltTables(file(list))).toBe(true);
  });
});

describe("B-4 fieldsWithNoInput names only a value written to the store", () => {
  it("passes a never-set state handed to a read", () => {
    const src = `const [filter, setFilter] = useState("");\nconst posts = useRows("posts", { s: filter });`;
    expect(fieldsWithNoInput(file(src))).toEqual([]);
  });
  it("still refuses a never-set state saved by create, inline or through a named payload", () => {
    expect(fieldsWithNoInput(file(`const [notes, setNotes] = useState("");\nposts.create({ notes: notes.trim() });`))).toEqual(["notes"]);
    expect(fieldsWithNoInput(file(`const [notes, setNotes] = useState("");\nconst values = { notes };\nposts.update(id, values);`))).toEqual(["notes"]);
  });
});

describe("a file the compiler cannot read is refused by name", () => {
  it("parses JSX + TypeScript, and names a syntax error", () => {
    expect(parseProblem(file(`const n: number = 1; export default () => <div>{n}</div>;`))).toBeNull();
    expect(parseProblem(file(`export default () => <div>;`))).toMatch(/^App\.tsx does not parse:/);
    const raw = { applet: { name: "X", entry: "App.tsx", files: [file(`export default () => <div>;`)], pages: [{ path: "/", title: "X", file: "App.tsx" }], sources: [], mandates: [] }, note: "" };
    expect(() => checkBuildAnswer(raw, coerceBuildAnswer(raw))).toThrow(/App\.tsx does not parse/);
  });
});
