/**
 * The builder's answer is refused when a file hand-builds a box a person writes in: every such
 * box is <WritingBox> (the platform's mic + read-aloud). "Fix it" sends this reason back.
 */
import { coerceBuildAnswer, BuildRefused } from "./build-applet";
import { checkBuildAnswer } from "./check-build-answer";

const answer = (source: string) => ({
  applet: {
    name: "Guest list",
    slug: "guest-list",
    description: "",
    entry: "App.tsx",
    files: [{ name: "App.tsx", source }],
    pages: [{ path: "/", title: "Guests", file: "App.tsx" }],
    sources: [],
    mandates: [],
  },
  note: "",
});

it("refuses a bare <textarea> and names WritingBox as the fix", () => {
  const raw = answer('export default function App() { return <textarea value="" onChange={() => {}} />; }');
  expect(() => checkBuildAnswer(raw, coerceBuildAnswer(raw))).toThrow(BuildRefused);
  expect(() => checkBuildAnswer(raw, coerceBuildAnswer(raw))).toThrow(/App\.tsx has a bare <textarea>.*<WritingBox/);
});

it("refuses the controls' Textarea too", () => {
  const raw = answer('import { Textarea } from "@ai-matrx/design-system/controls";\nexport default function App() { return <Textarea value="" />; }');
  expect(() => checkBuildAnswer(raw, coerceBuildAnswer(raw))).toThrow(/bare <Textarea>/);
});

it("accepts <WritingBox>", () => {
  const raw = answer('import { WritingBox } from "@ai-matrx/applets/react";\nexport default function App() { return <WritingBox value="" onValueChange={() => {}} label="Notes" />; }');
  expect(checkBuildAnswer(raw, coerceBuildAnswer(raw)).applet.files).toHaveLength(1);
});
