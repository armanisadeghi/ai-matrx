/**
 * The composer must show what THIS chat is wired to.
 *
 * Live break (2026-09-14, admin@admin.com on www.aimatrx.com): the only line
 * under the composer was the randomized suggestion strip — Nuxt / Clerk /
 * Notion — while the chat's own MCP servers, and Context7 attached seconds
 * earlier, were nowhere on screen. Arman: "I don't see an MCP chip."
 *
 * These cases fail if the list ever drifts back toward "servers you could
 * connect" or toward a state prettier than the run's own answer.
 */

import {
  selectChatConnections,
  type ChatConnectionCatalogEntry,
} from "./chat-connections";
import { indexRunMcpAttachments } from "./run-attachments";

const catalog: ChatConnectionCatalogEntry[] = [
  { slug: "context7", name: "Context7", state: "connected", reason: null },
  { slug: "deepwiki", name: "DeepWiki", state: "connected", reason: null },
  { slug: "github", name: "GitHub", state: "connected", reason: null },
  {
    slug: "amplitude",
    name: "Amplitude",
    state: "needs_reauth",
    reason: "Your Amplitude token expired on 2026-09-11.",
  },
  { slug: "nuxt-docs", name: "Nuxt Documentation", state: "connected", reason: null },
];

const noRun = {};

describe("selectChatConnections", () => {
  it("shows a server attached to this run, and nothing merely connectable", () => {
    const rows = selectChatConnections({
      agentServerSlugs: [],
      addedServerSlugs: ["context7"],
      catalog,
      runAttachments: noRun,
    });
    expect(rows.map((r) => r.slug)).toEqual(["context7"]);
    expect(rows[0].origin).toBe("run");
    // Nuxt is connectable and in the catalog; this chat is not wired to it.
    expect(rows.some((r) => r.slug === "nuxt-docs")).toBe(false);
  });

  it("keeps the agent's own servers, which ride every run", () => {
    const rows = selectChatConnections({
      agentServerSlugs: ["github"],
      addedServerSlugs: ["context7"],
      catalog,
      runAttachments: noRun,
    });
    expect(rows.map((r) => r.slug).sort()).toEqual(["context7", "github"]);
    expect(rows.find((r) => r.slug === "github")?.origin).toBe("agent");
  });

  it("lets the run overrule a catalog that still says connected", () => {
    const rows = selectChatConnections({
      agentServerSlugs: ["github"],
      addedServerSlugs: [],
      catalog,
      runAttachments: indexRunMcpAttachments([
        {
          slug: "github",
          state: "not_connected",
          reason: "Connect GitHub in AI Matrx first.",
          toolCount: 0,
        },
      ]),
    });
    expect(rows[0].state).toBe("not_connected");
    expect(rows[0].reason).toBe("Connect GitHub in AI Matrx first.");
  });

  it("puts what is broken in front of what works", () => {
    const rows = selectChatConnections({
      agentServerSlugs: ["deepwiki", "amplitude", "github"],
      addedServerSlugs: [],
      catalog,
      runAttachments: noRun,
    });
    expect(rows.map((r) => r.slug)).toEqual([
      "amplitude",
      "deepwiki",
      "github",
    ]);
  });

  it("never drops a server the run reported but the settings forgot", () => {
    // Exactly the live case: the attachment was made on the /chat/new draft
    // and the conversation that ran carried no local record of it.
    const rows = selectChatConnections({
      agentServerSlugs: [],
      addedServerSlugs: [],
      catalog,
      runAttachments: indexRunMcpAttachments([
        { slug: "context7", state: "connected", reason: null, toolCount: 2 },
      ]),
    });
    expect(rows.map((r) => r.slug)).toEqual(["context7"]);
    expect(rows[0].runAttachment?.toolCount).toBe(2);
  });

  it("names an uncatalogued slug rather than hiding it", () => {
    const rows = selectChatConnections({
      agentServerSlugs: ["some-new-server"],
      addedServerSlugs: [],
      catalog,
      runAttachments: noRun,
    });
    expect(rows[0].name).toBe("some-new-server");
    expect(rows[0].state).toBe("not_connected");
  });

  it("is empty when the chat is wired to nothing, so the suggestion strip may speak", () => {
    expect(
      selectChatConnections({
        agentServerSlugs: undefined,
        addedServerSlugs: undefined,
        catalog,
        runAttachments: noRun,
      }),
    ).toEqual([]);
  });
});
