/**
 * Guard: every host that renders tool-call cards must hand them the
 * conversation id (ask_person looks up its open ask by it and otherwise
 * says "Done" before the person answers).
 *
 * Behaviour: bodies fall back to ToolConversationContext, so the modal
 * (ToolUpdatesOverlay) cannot drop it. Static: any file that mounts a
 * registry renderer with `toolGroupId=` / `toolGroupId:` must also mention
 * conversationId.
 */
import fs from "fs";
import path from "path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ROOT = path.resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name === "__tests__" || f.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(f.name) && !/\.test\.tsx$/.test(f.name)) {
      out.push(p);
    }
  }
  return out;
}

describe("every tool-card host passes the conversation id", () => {
  it("each file that mounts a card renderer references conversationId near it", () => {
    const offenders: string[] = [];
    for (const file of walk(ROOT)) {
      const src = fs.readFileSync(file, "utf8");
      // A host mounts renderers it looked up from the registry (or an overlay
      // tab spec's Component); renderers forwarding to their own children are not hosts.
      const isHost =
        /\b(getInlineRenderer|getOverlayRenderer)\b/.test(src) ||
        /<Component[\s\S]{0,200}toolGroupId=/.test(src);
      if (!isHost || /registry\/registry\.tsx$/.test(file)) continue;
      // Every renderer mount site must carry conversationId within its props.
      const re = /<(InlineRenderer|Component|OverlayRenderer)\b|createElement\(\s*(InlineRenderer|OverlayRenderer)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const win = src.slice(m.index, m.index + 500);
        if (!/conversationId/.test(win)) {
          offenders.push(`${path.relative(ROOT, file)}@${m.index}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ToolUpdatesOverlay accepts and provides conversationId", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/ToolUpdatesOverlay.tsx"),
      "utf8",
    );
    expect(src).toMatch(/conversationId\?: string \| null/);
    expect(src).toMatch(/<ToolConversationProvider conversationId=\{conversationId\}/);
    const host = fs.readFileSync(
      path.join(ROOT, "components/ToolCallVisualization.tsx"),
      "utf8",
    );
    expect(host).toMatch(/<ToolUpdatesOverlay[\s\S]*?conversationId=\{conversationId\}/);
  });

  it("CustomOverlayBody falls back to the context conversation id", () => {
    const { CustomOverlayBody } = require("../ToolTabBodies");
    const { ToolConversationProvider } = require("../ToolConversationContext");
    let seen: unknown = "unset";
    const Probe = (p: { conversationId?: string }) => {
      seen = p.conversationId;
      return null;
    };
    const entry = { callId: "c1", toolName: "ask_person", events: [] };
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(
        <ToolConversationProvider conversationId="conv-123">
          <CustomOverlayBody entry={entry} Component={Probe} />
        </ToolConversationProvider>,
      );
    });
    act(() => root.unmount());
    expect(seen).toBe("conv-123");
  });
});
