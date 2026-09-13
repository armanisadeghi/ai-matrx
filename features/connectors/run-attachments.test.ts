/**
 * A chip must report THIS run, not a hope.
 *
 * Live break (2026-09-13): a user attached the GitHub MCP mid-chat, the chat
 * showed a checkmark, and the model truthfully said it had no GitHub tool.
 * The server now says exactly what happened on every run; these are the
 * shapes it sends.
 */

import {
  indexRunMcpAttachments,
  readRunMcpAttachments,
} from "./run-attachments";

const summary = (attachments: unknown[]) => ({
  code: "mcp_attachments",
  system_message: "1 of 2 attached MCP server(s) reached this run",
  metadata: { attachments },
});

describe("readRunMcpAttachments", () => {
  it("reports the tool count a healthy server contributed", () => {
    const rows = readRunMcpAttachments(
      [
        summary([
          { slug: "github", state: "connected", reason: null, tool_count: 47 },
        ]),
      ],
      [],
    );
    expect(rows).toEqual([
      { slug: "github", state: "connected", reason: null, toolCount: 47 },
    ]);
  });

  it("turns a server that screamed into a failed chip with its own words", () => {
    const rows = readRunMcpAttachments(
      [],
      [
        {
          code: "mcp_server_unavailable",
          user_message:
            "The github MCP is attached to this chat but produced no tools: Connect GitHub in AI Matrx first.",
          metadata: {
            slug: "github",
            reason: "Connect GitHub in AI Matrx first.",
          },
        },
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("not_connected");
    expect(rows[0].toolCount).toBe(0);
    expect(rows[0].reason).toBe("Connect GitHub in AI Matrx first.");
  });

  it("never leaves a server that failed looking healthy", () => {
    // Both events arrive for the same slug; the failure must win.
    const rows = readRunMcpAttachments(
      [
        summary([
          { slug: "asana", state: "connected", reason: null, tool_count: 12 },
        ]),
      ],
      [
        {
          code: "mcp_server_unavailable",
          metadata: { slug: "asana", reason: "token expired" },
        },
      ],
    );
    expect(rows[0].state).not.toBe("connected");
    expect(rows[0].toolCount).toBe(0);
    expect(rows[0].reason).toBe("token expired");
  });

  it("keeps needs_reauth rather than flattening it to not connected", () => {
    const rows = readRunMcpAttachments(
      [
        summary([
          {
            slug: "screenshotone",
            state: "needs_reauth",
            reason: "refresh_failed — reconnect it",
            tool_count: 3,
          },
        ]),
      ],
      [{ code: "mcp_server_unavailable", metadata: { slug: "screenshotone" } }],
    );
    expect(rows[0].state).toBe("needs_reauth");
    expect(rows[0].reason).toBe("refresh_failed — reconnect it");
  });

  it("ignores unrelated events and malformed rows", () => {
    expect(
      readRunMcpAttachments(
        [
          { code: "something_else", metadata: { attachments: [{ slug: "x" }] } },
          { code: "mcp_attachments", metadata: { attachments: "nope" } },
          summary([{ state: "connected" }, null]),
        ],
        [{ code: "other_warning", metadata: { slug: "y" } }],
      ),
    ).toEqual([]);
  });

  it("indexes by slug for chip lookups", () => {
    const index = indexRunMcpAttachments(
      readRunMcpAttachments(
        [
          summary([
            { slug: "github", state: "connected", reason: null, tool_count: 47 },
          ]),
        ],
        [],
      ),
    );
    expect(index.github.toolCount).toBe(47);
    expect(index.missing).toBeUndefined();
  });
});
