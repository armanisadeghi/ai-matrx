// 🚨 NEW-23 (VERIFY-U-P1-R5) — THE HISTORY ACTOR IS RESOLVED BY THE PLATFORM'S
// ONE IDENTITY RESOLVER, AND THERE IS NO SECOND ONE.
//
// Every history row printed a bare 36-character uuid under "Changed by", to a
// brilliant NON-technical expert, because no entity registry gives `actor_id` a
// door. The fix is a host port the primitive asks first — and the danger in
// "resolve a user id to a name" is that an agent writes a THIRD org-members read
// instead of using `useRecordActors` (the reusable resolver behind the official
// record stamps) and `resolveUserName` (the ONE way this app names a user-shaped
// object). A second resolver is a defect even when it works.
//
// Red before the wiring: `DetailHost.tsx` bound no `ActorName` and
// `HistoryActorName.tsx` did not exist.

import { readFileSync } from "node:fs";
import path from "node:path";

const HERE = path.resolve(__dirname, "..");

function read(file: string): string {
  return readFileSync(path.join(HERE, file), "utf8");
}

describe("the host's history-actor binding", () => {
  it("binds the ActorName port, so no record shows a bare uuid", () => {
    expect(read("DetailHost.tsx")).toContain("ActorName: HistoryActorName");
  });

  it("uses the existing resolvers and reads nothing of its own", () => {
    const source = read("HistoryActorName.tsx");
    expect(source).toContain(
      'from "@/components/official/record-stamps/useRecordActors"',
    );
    expect(source).toContain('from "@/components/user/UserIdentity"');
    // No second directory read, and no client of its own.
    expect(source).not.toMatch(/getOrganizationMembers|supabase|\.rpc\(|\.from\(/);
  });

  it("falls back to the id with a reason, never to a blank or a claim", () => {
    const source = read("HistoryActorName.tsx");
    expect(source).toContain("could not find the person behind this id");
    expect(source).toContain("{actorId}");
  });
});
