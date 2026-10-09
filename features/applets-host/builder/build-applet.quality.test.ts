/**
 * WHAT THE BUILDER MAKES DOES WHAT SHE ASKED (lane AA, 2026-10-08). Each case is cut from the social
 * planner the builder made for "A planner for my social posts…": the create form saved what she typed in
 * "Brand Requirements & Guidance" into Guidance and never set Requirements; "New Post" had no handler; a
 * table the app makes had no way to add a row. checkBuildAnswer refuses each, and the refusal is the
 * reason the automatic fix round sends back.
 */
import { deadButtons, fieldsWithNoInput } from "./applet-code-checks";
import { coerceBuildAnswer, BuildRefused, newTableGaps } from "./build-applet";
import { checkBuildAnswer } from "./check-build-answer";

const POST_MODAL = `import { WritingBox } from "@ai-matrx/applets/react";
import React, { useState } from "react";
export function PostModal({ postsSource, onClose }) {
  const [title, setTitle] = useState("");
  const [requirements, setRequirements] = useState("");
  const [guidance, setGuidance] = useState("");
  const handleSubmit = async (e) => {
    e.preventDefault();
    await postsSource.create({ title: title.trim(), requirements: requirements.trim() || null, guidance: guidance.trim() || null });
    onClose();
  };
  return (
    <form onSubmit={handleSubmit}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <WritingBox label="Brand Requirements & Guidance" value={guidance} onValueChange={setGuidance} rows={2} />
      <button type="submit">Create Post</button>
    </form>
  );
}`;

const file = (name: string, source: string) => ({ name, source });

describe("fieldsWithNoInput", () => {
  it("names the field that is saved but never set (Requirements in the social planner)", () => {
    expect(fieldsWithNoInput(file("post_modal.tsx", POST_MODAL))).toEqual(["requirements"]);
  });
  it("passes once every saved field has its own input", () => {
    const fixed = POST_MODAL.replace(
      '<WritingBox label="Brand Requirements & Guidance"',
      '<WritingBox label="Brand requirements" value={requirements} onValueChange={setRequirements} />\n      <WritingBox label="Guidance"',
    );
    expect(fieldsWithNoInput(file("post_modal.tsx", fixed))).toEqual([]);
  });
});

describe("deadButtons", () => {
  it("names a button with no handler", () => {
    const src = `export default function P() { return <div><Button variant="primary">\n  <Plus className="w-4 h-4" /> New Post\n</Button><Button onClick={() => go("/x")}>Open</Button></div>; }`;
    expect(deadButtons(file("posts.tsx", src))).toEqual(["New Post"]);
  });
  it("accepts submit buttons, asChild, spread props, a button inside a Link, and arrow handlers containing >", () => {
    const src = `<form><button type="submit">Save</button><Button asChild><a href="/x">Go</a></Button><Button {...rest}>X</Button><Link to="/add"><Button variant="primary">Add Guest</Button></Link><Button onClick={() => (a > b ? f() : g())}>Y</Button></form>`;
    expect(deadButtons(file("f.tsx", src))).toEqual([]);
  });
});

describe("newTableGaps", () => {
  const posts = {
    alias: "posts",
    new_table: {
      name: "Posts",
      fields: [
        { key: "title", label: "Title", type: "text" },
        { key: "requirements", label: "Requirements", type: "long_text" },
        { key: "tt_views", label: "TikTok views", type: "number" },
        { key: "yt_views", label: "YouTube views", type: "number" },
      ],
    },
  };
  it("names a declared field no page shows, and a table nothing adds a row to", () => {
    const src = `const posts = useRows("posts"); export default () => posts.rows.map((r) => <div>{r.title}{r[\`\${p}_views\`]}</div>);`;
    const gaps = newTableGaps({ files: [file("posts.tsx", src)], sources: [posts as never] });
    expect(gaps).toEqual([
      'the table "posts" declares "requirements" but no page shows or edits it',
      'nothing in the app adds a row to "posts" — give her a way to create one',
    ]);
  });
  it("sees a create through a prop (postsSource={posts}) and template-built keys", () => {
    const page = `const posts = useRows("posts"); <PostModal postsSource={posts} />; r.requirements; r[\`\${p}_views\`]`;
    expect(newTableGaps({ files: [file("page.tsx", page), file("post_modal.tsx", POST_MODAL)], sources: [posts as never] })).toEqual([]);
  });
});

it("checkBuildAnswer refuses the social planner's create form with the reason the fix round needs", () => {
  const raw = {
    applet: {
      name: "Planner",
      slug: "planner",
      entry: "post_modal.tsx",
      files: [{ name: "post_modal.tsx", source: POST_MODAL }],
      pages: [{ path: "/", title: "Posts", file: "post_modal.tsx" }],
      sources: [],
      mandates: [],
    },
    note: "",
  };
  expect(() => checkBuildAnswer(raw, coerceBuildAnswer(raw))).toThrow(BuildRefused);
  expect(() => checkBuildAnswer(raw, coerceBuildAnswer(raw))).toThrow(/post_modal\.tsx saves "requirements" but no input ever sets it/);
});
