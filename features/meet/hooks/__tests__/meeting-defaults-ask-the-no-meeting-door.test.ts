// Lane HR-360 (2026-10-08) — meeting defaults ask communication.meet_policy_for in its
// "no meeting yet" form (organization, host, rule), never with a cast null standing in for
// p_profile / p_meeting_id. Red before: the hook passed `null as unknown as string` twice.
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(__dirname, "..", "useMeetDefaults.ts"), "utf8");
const call = src.slice(src.indexOf('rpc("meet_policy_for"'), src.indexOf('rpc("meet_policy_for"') + 600);

it("calls the 3-argument door with no cast", () => {
  expect(src.includes('rpc("meet_policy_for"')).toBe(true);
  expect(src).not.toMatch(/as unknown as/);
  expect(call).not.toMatch(/p_profile|p_meeting_id/);
  expect(call).toMatch(/p_organization_id[\s\S]*p_host_user_id[\s\S]*p_key/);
});
