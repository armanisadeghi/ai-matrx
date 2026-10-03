/**
 * An agent's reply in a thread is filed under the person whose run it was, and
 * NAMED as the agent (threads ruling R5). The mapper reads the agent off the row
 * the moment cmt_list returns it; a person's row is unchanged.
 *
 * Use case: the intake agent answers a site lead's question about which scale
 * weighs inbound aluminum.
 */
import { authorOf } from "../comment-author";

const PERSON = {
  created_by: "user-dana",
  author_display_name: "Dana Reyes",
  author_email: "dana@allgreen.example",
  author_avatar_url: "https://cdn.example/dana.png",
};

it("a person's row names the person", () => {
  expect(authorOf(PERSON)).toEqual({ id: "user-dana", name: "Dana Reyes", avatarUrl: "https://cdn.example/dana.png" });
});

it("an agent-written row names the agent, never the person it was filed under", () => {
  const author = authorOf({ ...PERSON, created_by_tier: "agent", author_agent_id: "agent-intake", author_agent_name: "Scrap Intake Advisor" });
  expect(author.name).toBe("Scrap Intake Advisor");
  expect(author.agent).toEqual({ id: "agent-intake", name: "Scrap Intake Advisor" });
  expect(author.avatarUrl).toBeNull();
});

it("an agent row with no name or id yet still reads as an agent, never as the person", () => {
  expect(authorOf({ ...PERSON, created_by_tier: "agent" })).toEqual({
    id: "user-dana",
    name: "Agent",
    avatarUrl: null,
    agent: { id: null, name: "Agent" },
  });
  expect(authorOf({ ...PERSON, author_agent_id: "agent-intake" }).agent).toEqual({ id: "agent-intake", name: "Agent" });
});

it("before the server returns the new columns, every row is a person (degrades cleanly)", () => {
  expect(authorOf({ ...PERSON, created_by_tier: "user" }).agent).toBeUndefined();
  expect(authorOf({ ...PERSON, created_by_tier: null, author_agent_id: null }).agent).toBeUndefined();
});
