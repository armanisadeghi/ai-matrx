// features/make/__tests__/install-reads-the-agent-an-already-answer-carries.test.ts
//
// THE USE CASE: a person opens a template they already installed (the gallery's "Use template", Spaces'
// "Add the sample") and the store answers `already`. Every template door now answers its agent in the
// ONE shape a fresh install uses (`platform_agent`, `copied`, bindings with `table_id` from the install's
// id map — store guard compares the key sets). The host makes the assistant from that answer.
//
// BREAKS THIS CATCHES: "The sample's assistant was not made: Cannot read properties of undefined
// (reading 'name')" · a copy bound to no table.

jest.mock("@/features/templates/agentCopyHost", () => ({ templateAgentCopier: jest.fn(), templateAgentArchiver: jest.fn() }));

import { addInstalledAgent, agentStillToCopy, type InstallAnswer } from "../gallery/installAgent";

const ALREADY: InstallAnswer = {
  install_id: "inst-1",
  state: "installed",
  done: true,
  already: true,
  made: [{ kind: "table", id: "tbl-1", ref: "tables.clients", title: "Clients", table_id: null }],
  host: { ids: { "tables.clients": "tbl-1" } },
  // The one agent shape every template door answers with.
  agent: {
    name: "Ask your agency",
    copied: null,
    platform_agent: { id: "4cd676c6-f55d-4426-b7eb-a9d0273566ec", name: "Answers From Your Tables" },
    bindings: [{ variable: "clients", tableToken: "clients", table_id: "tbl-1", describes: "your clients" }],
  },
} as unknown as InstallAnswer;

function ports() {
  const note = jest.fn(async (_i: string, id: string, label: string) => ({ ...ALREADY, made: [...(ALREADY.made ?? []), { kind: "agent", id, ref: "agent", title: label, table_id: null }] }) as InstallAnswer);
  const copier = jest.fn().mockResolvedValue({ agentId: "agent-1" });
  const claim = jest.fn().mockResolvedValue({ state: "claimed", orphans: [] });
  return { note, copier, claim };
}

describe("an `already` answer's agent is copied", () => {
  it("copies the assistant from the one answer shape, bound to the table the install made", async () => {
    expect(agentStillToCopy(ALREADY)).toBe(true);
    const p = ports();
    const r = await addInstalledAgent(ALREADY, "org-1", p);
    expect(r).toMatchObject({ ok: true });
    expect(p.copier.mock.calls[0][0]).toMatchObject({
      platformAgentId: "4cd676c6-f55d-4426-b7eb-a9d0273566ec",
      platformAgent: "Answers From Your Tables",
      name: "Ask your agency",
    });
    expect(p.copier.mock.calls[0][0].bindings[0]).toMatchObject({ variable: "clients", tableToken: "clients", tableId: "tbl-1" });
    expect(p.note).toHaveBeenCalledWith("inst-1", "agent-1", "Ask your agency");
  });

  it("says in a sentence when the answer names no platform agent at all", async () => {
    const bad = { ...ALREADY, agent: { name: "Ask your agency", bindings: [] } } as unknown as InstallAnswer;
    const p = ports();
    const r = await addInstalledAgent(bad, "org-1", p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.why).toMatch(/does not say which assistant to copy/);
    expect(p.copier).not.toHaveBeenCalled();
  });
});
