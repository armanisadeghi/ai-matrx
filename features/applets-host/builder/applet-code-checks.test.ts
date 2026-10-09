/**
 * THE REFUSAL CHECKS NEVER BLOCK A VALID APPLET (lane AL, 2026-10-08). Each pair is a case a reviewer
 * proved the old regex checks refused, beside the true violation the check must still refuse. Every
 * check reads the syntax tree, so a word in a string, JSX text or a comment is never code.
 */
import { archiveCalledDelete, browserDialogs, deadButtons, examplesSeededAsValues, fieldsWithNoInput, formsReseededFromRow, handBuiltTables, jobValuesNotTaken, misspelledChoices, parseProblem, writesFromEffects } from "./applet-code-checks";
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

// The live social-post-planner `post_detail.tsx` (app.definition, 2026-10-08 21:14), cut to the lines checked.
const LIVE_POST_DETAIL = `import React, { useState, useEffect } from 'react';
import { usePage, useRow, useRows, navigate, RecordField, confirmAction } from '@ai-matrx/applets/react';
export default function PostDetailPage() {
  const { params } = usePage();
  const isNew = !params?.id || params.id === 'new';
  const { row, status, update, archive } = useRow('posts', isNew ? null : params.id);
  const [values, setValues] = useState({ title: '' });
  useEffect(() => {
    if (row && !isNew) {
      setValues({ title: row.title || '' });
    }
  }, [row, isNew]);
  async function handleDelete() {
    if (
      await confirmAction({
        title: 'Delete this post?',
        description: 'This will remove the post and associated metrics.',
        confirmLabel: 'Delete',
        variant: 'destructive'
      })
    ) {
      await archive();
      navigate('/posts');
    }
  }
  return <RecordField source="posts" field="title" value={values.title} onValueChange={(v) => setValues({ title: v })} />;
}`;

describe("B-5 formsReseededFromRow names a form copied from the row object on every change", () => {
  it("refuses the live page's useEffect(() => setValues(...row...), [row, isNew])", () => {
    expect(formsReseededFromRow(file(LIVE_POST_DETAIL, "post_detail.tsx"))).toEqual(["row"]);
    expect(formsReseededFromRow(file(`const { row: post } = useRow("posts", id);\nReact.useEffect(() => { if (post) setForm({ ...post }); }, [post]);`))).toEqual(["post"]);
    expect(formsReseededFromRow(file(`const one = useRow("posts", id);\nuseEffect(() => { setForm(one.row); }, [one.row]);`))).toEqual(["one.row"]);
  });
  it("passes a form seeded once per record, an effect on the id, and an effect that sets nothing", () => {
    expect(formsReseededFromRow(file(`const { row } = useRow("posts", id);\nreturn row ? <PostForm key={row._id} row={row} /> : null;\nfunction PostForm({ row }) { const [v, setV] = useState(() => ({ title: row.title })); return null; }`))).toEqual([]);
    expect(formsReseededFromRow(file(`const { row } = useRow("posts", id);\nuseEffect(() => { if (row) setForm({ ...row }); }, [row?._id]);`))).toEqual([]);
    expect(formsReseededFromRow(file(`const { row } = useRow("posts", id);\nuseEffect(() => { document.title = row?.title ?? ""; }, [row]);`))).toEqual([]);
    // A `row` that is not a useRow answer (a list item, a prop) is not this check's business.
    expect(formsReseededFromRow(file(`function Card({ row }) { useEffect(() => { setOpen(false); }, [row]); return null; }`))).toEqual([]);
  });
});

describe("B-6 archiveCalledDelete names a confirm that calls an archive a delete", () => {
  it("refuses the live page's 'Delete this post?' before archive()", () => {
    expect(archiveCalledDelete(file(LIVE_POST_DETAIL, "post_detail.tsx"))).toEqual(["Delete"]);
  });
  it("passes an archive confirm that says Archive, and a delete confirm with no archive call", () => {
    expect(archiveCalledDelete(file(`async function a() { if (await confirmAction({ title: "Archive this post?", description: "It leaves every list; you can restore it.", confirmLabel: "Archive" })) posts.archive(row._id); }`))).toEqual([]);
    expect(archiveCalledDelete(file(`async function d() { if (await confirmAction({ title: "Delete this draft?" })) clearDraft(); }`))).toEqual([]);
  });
  it("passes the REAL refused pet-grooming confirm: 'removed from your active schedule view' is true of an archive (F17)", () => {
    const real = `const handleArchive = async () => {
    const confirmed = await confirmAction({
      title: "Archive this appointment?",
      description: "It will be removed from your active schedule view.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (confirmed) {
      await archive();
      navigate("/");
    }
  };`;
    expect(archiveCalledDelete(file(real, "appointment_detail_page.tsx"))).toEqual([]);
    expect(archiveCalledDelete(file(real.replace("It will be removed from", "It will be permanently gone from"), "x.tsx"))).toEqual(["permanently"]);
  });
  it("checkBuildAnswer refuses the live page by name, both ways", () => {
    const raw = { applet: { name: "X", entry: "post_detail.tsx", files: [file(LIVE_POST_DETAIL, "post_detail.tsx")], pages: [{ path: "/", title: "X", file: "post_detail.tsx" }], sources: [{ alias: "posts", table_id: "t", organization_id: "o" }], mandates: [] }, note: "" };
    expect(() => checkBuildAnswer(raw, coerceBuildAnswer(raw))).toThrow(/copies row into its form on every change.*says "Delete" next to archive\(\).*reword that confirm/);
  });
});

describe("F1 jobValuesNotTaken — a form fills its own job", () => {
  const CITY = new Map([["main", ["city", "what", "response_format"]]]);
  it("refuses the live legal form on a city guide (city-travel-guide v6: onExecute(variables) over useState({ matter, … }))", () => {
    const src = `import { useJob } from "@ai-matrx/applets/react";
export default function LegalMattersApp() {
  const job = useJob("main");
  const onExecute = async (variables, userInput) => {
    await job.run(variables, userInput ? { userInput } : undefined);
  };
  const [variables, setVariables] = useState({ matter: '', practiceArea: '', details: '' });
  const handleSubmit = async () => { await onExecute(variables); };
  return <button onClick={handleSubmit}>Generate</button>;
}`;
    expect(jobValuesNotTaken(file(src), CITY)).toEqual([{ alias: "main", sent: ["matter", "practiceArea", "details"], takes: ["city", "what", "response_format"] }]);
  });
  it("passes the stock form whose FIELDS are the job's own inputs, and an inline literal of the job's names", () => {
    const stock = `const FIELDS = [{ "name": "city" }, { "name": "response_format" }, { "name": "what" }];
function initialValues() { return {}; }
export default function App() {
  const job = useJob("main");
  const [values, setValues] = useState(initialValues);
  const submit = async () => { await job.run(values, undefined); };
  return <button onClick={submit}>Run</button>;
}`;
    expect(jobValuesNotTaken(file(stock), CITY)).toEqual([]);
    expect(jobValuesNotTaken(file(`const job = useJob("main");\nconst go = () => job.run({ city: "Lisbon", what: "food" });`), CITY)).toEqual([]);
  });
  it("names a renamed input (metro_name where the job takes region_name)", () => {
    const src = `const job = useJob("main");\nconst [v, setV] = useState(() => ({ metro_name: "", sub_regions: "" }));\nconst go = () => job.run(v);`;
    expect(jobValuesNotTaken(file(src), new Map([["main", ["region_name", "sub_regions"]]]))).toEqual([{ alias: "main", sent: ["metro_name"], takes: ["region_name", "sub_regions"] }]);
  });
  it("does not check a job whose inputs it was not told", () => {
    expect(jobValuesNotTaken(file(`const job = useJob("other");\njob.run({ anything: 1 });`), CITY)).toEqual([]);
  });
});

// The offer-breakdowns list (live, 2026-10-09) seeded its example from an effect; the preview held the write.
describe("writesFromEffects names a row written from an effect", () => {
  it("names create( inside useEffect, not create( in a handler", () => {
    const live = `const breakdowns = useRows('offer_breakdowns');\nuseEffect(() => {\n  if (breakdowns.status === 'ready' && breakdowns.rows.length === 0 && !seeding) {\n    setSeeding(true);\n    breakdowns.create(SAMPLE_BREAKDOWN).finally(() => setSeeding(false));\n  }\n}, [breakdowns.status, breakdowns.rows.length, seeding]);`;
    expect(writesFromEffects(file(live, "breakdowns_list.tsx"))).toEqual(["create"]);
    expect(writesFromEffects(file(`React.useEffect(() => { void posts.create({ title: "x" }); }, []);`))).toEqual(["create"]);
    expect(writesFromEffects(file(`const save = () => posts.create(values);\nuseEffect(() => { document.title = "x"; }, []);`))).toEqual([]);
  });
});

describe("F8 examplesSeededAsValues: an example is a placeholder, never a value", () => {
  it("names a form that starts with the example its placeholder offers (live: 34 Applets, 2026-10-09)", () => {
    const src = `import { useState } from "react";
export default function App() {
  const [form, setForm] = useState({ city: 'New York City', interest: '' });
  const [destination, setDestination] = useState(() => "Syria");
  return <div>
    <input value={form.city} placeholder="e.g. Paris, Tokyo, New York City..." onChange={(e) => setForm({ ...form, city: e.target.value })} />
    <input value={destination} placeholder="e.g. Syria, North Korea" onChange={(e) => setDestination(e.target.value)} />
  </div>;
}`;
    expect(examplesSeededAsValues(file(src))).toEqual([
      { name: "city", value: "New York City" },
      { name: "destination", value: "Syria" },
    ]);
  });

  it("passes an empty start, and a choice default no placeholder offers", () => {
    const src = `import { useState } from "react";
export default function App() {
  const [form, setForm] = useState({ city: "", tone: "Friendly" });
  const [kind, setKind] = useState("all");
  return <div>
    <input value={form.city} placeholder="e.g. Paris" onChange={() => undefined} />
    <select value={kind} onChange={() => undefined}><option value="all">All</option></select>
  </div>;
}`;
    expect(examplesSeededAsValues(file(src))).toEqual([]);
  });
});
