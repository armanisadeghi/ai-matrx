import { parseRoleDescriberOutput } from "./conductorService";

const MEMBERS = [
  { id: "21bb212a", role_title: "Study Notes Composer", gap: "Writes structured study notes." },
  { id: "3d0632fd", role_title: "Quiz Question Generator", gap: "Writes comprehension quizzes." },
];

describe("parseRoleDescriberOutput", () => {
  it("reads the enforced object answer", () => {
    const rows = parseRoleDescriberOutput(JSON.stringify({ members: MEMBERS }));
    expect(rows).toEqual([
      { id: "21bb212a", roleTitle: "Study Notes Composer", gap: "Writes structured study notes." },
      { id: "3d0632fd", roleTitle: "Quiz Question Generator", gap: "Writes comprehension quizzes." },
    ]);
  });

  it("still reads a bare array answer", () => {
    expect(parseRoleDescriberOutput("```json\n" + JSON.stringify(MEMBERS) + "\n```")).toHaveLength(2);
  });

  it("returns nothing for unreadable output", () => {
    expect(parseRoleDescriberOutput("I could not do that.")).toEqual([]);
    expect(parseRoleDescriberOutput('{"members": "oops"}')).toEqual([]);
  });
});
