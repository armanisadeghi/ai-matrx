// features/make/__tests__/install-adds-the-templates-agent.test.tsx
//
// THE USE CASE. A member installs a template that comes with an assistant. The install door makes
// the tables and answers an uncopied `agent`; the gallery must copy it for her (bound to the tables
// the install just made), record it on the install, and list it on the landing as a link.
//
// BREAKS THIS CATCHES: the agent answered and never copied (the 2026-10-04 walk) · the copier run
// without the installed table ids · a copy that is not recorded on the install · a re-open copying
// a second time · a failed copy that is silent · an agent that does not appear on the landing.

import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@/features/kits/templateAgentCopyHost", () => ({ templateAgentCopier: jest.fn(), templateAgentArchiver: jest.fn() }));

import { addInstalledAgent, agentStillToCopy, agentsLeftBy, type InstallAnswer } from "../gallery/installAgent";
import { Landing } from "../gallery/TemplateGallery";
import { hrefForMade } from "../gallery/catalogue";

const ANSWER: InstallAnswer = {
  install_id: "inst-1",
  state: "installed",
  done: true,
  made: [{ kind: "table", id: "tbl-1", ref: "clients", title: "Clients", table_id: null }],
  agent: {
    platform_agent: { id: "plat-1", name: "Answers From Your Tables" },
    name: "Practice assistant",
    copied: false,
    bindings: [{ variable: "tables", tableToken: "clients", describes: "your clients", table_id: "tbl-1" }],
  },
};

const noted = (agentId: string): InstallAnswer => ({
  ...ANSWER,
  made: [...(ANSWER.made ?? []), { kind: "agent", id: agentId, ref: "agent", title: "Practice assistant", table_id: null }],
});

describe("a template install adds its agent", () => {
  it("copies an uncopied agent with the installed table ids, records it, and the landing lists it", async () => {
    const copier = jest.fn().mockResolvedValue({ agentId: "agent-9" });
    const note = jest.fn().mockResolvedValue(noted("agent-9"));
    expect(agentStillToCopy(ANSWER)).toBe(true);

    const r = await addInstalledAgent(ANSWER, "org-1", { copier, note });

    expect(copier).toHaveBeenCalledTimes(1);
    expect(copier.mock.calls[0][0]).toMatchObject({
      organizationId: "org-1",
      platformAgentId: "plat-1",
      name: "Practice assistant",
      bindings: [{ variable: "tables", tableToken: "clients", tableId: "tbl-1", describes: "your clients" }],
    });
    expect(note).toHaveBeenCalledWith("inst-1", "agent-9", "Practice assistant");
    expect(r.ok).toBe(true);
    expect(agentStillToCopy(r.answer)).toBe(false);

    const html = renderToStaticMarkup(<Landing made={r.answer.made as never} />);
    expect(html).toContain('data-make-template-landing-row="agent"');
    expect(html).toContain('href="/agents/agent-9"');
    expect(hrefForMade({ kind: "agent", id: "a", ref: "agent", title: null, table_id: null })).toBe("/agents/a");
  });

  it("says a failed copy in one line with a Retry, and never records it", async () => {
    const copier = jest.fn().mockRejectedValue(new Error("Could not copy the agent: no access"));
    const note = jest.fn();
    const r = await addInstalledAgent(ANSWER, "org-1", { copier, note });
    expect(r.ok).toBe(false);
    expect(note).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(
      <Landing made={ANSWER.made as never} agent={{ phase: "failed", why: (r as { why: string }).why }} retryAgent={() => undefined} />,
    );
    expect(html).toContain("The assistant was not added — Could not copy the agent: no access");
    expect(html).toContain("Retry");
  });

  it("never copies twice: an agent already on the install is not copied again", () => {
    expect(agentStillToCopy(noted("agent-9"))).toBe(false);
  });

  it("finds the agents an uninstall leaves for the host to archive", () => {
    expect(agentsLeftBy({ left: [{ kind: "agent", id: "agent-9" }, { kind: "record", id: "r" }] })).toEqual(["agent-9"]);
  });
});
