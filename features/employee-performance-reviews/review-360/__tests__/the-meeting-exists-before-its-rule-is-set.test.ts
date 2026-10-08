// Lane HR-360-2 (2026-10-08) — "Schedule meeting" made the meeting FIRST, then set the per-meeting rule with its id.
// Red before: the rule was set as meet_policy_set(p_key, p_value) with no meeting, a signature the live database
// does not have ("Could not find the function communication.meet_policy_set(p_key, p_value)").
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(__dirname, "../ReviewMeetingActions.tsx"), "utf8");

it("sets the rule through (p_meeting_id, p_key, p_value) after the meeting is made, never without the meeting", () => {
  const call = src.indexOf('"meet_policy_set"');
  expect(call).toBeGreaterThan(0);
  expect(src.slice(call, call + 160)).toMatch(/p_meeting_id:\s*made\.id/);
  // the meeting is created before the rule call
  expect(src.slice(0, call)).toMatch(/const made\s*=/);
  expect(src).not.toMatch(/meet_policy_set"\s*,\s*\{\s*p_key/);
});
