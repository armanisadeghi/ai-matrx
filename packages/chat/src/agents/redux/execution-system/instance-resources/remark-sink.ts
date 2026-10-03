// packages/chat/src/agents/redux/execution-system/instance-resources/remark-sink.ts
//
// THE REMARK SINK — where a comment made on a page that is not a chat goes
// when the person wants it to ride along with their next message.
//
// A comment on a chat answer stages into that answer's own conversation
// (remarks.ts, the message's conversationId). A comment on anything else — the
// whole board, a task tile on it, a passage of a note tile, a record's thread in
// the canvas — has no conversation of its own: it goes to the agent chat of the
// page the person is working in. A page with such a chat (ChatCanvasWorkspace:
// the Board, a module workspace) REGISTERS itself as the sink while mounted;
// comment surfaces ask `activeRemarkSink()` at post time.
//
// A registry and not a React context on purpose: the canvas column (where
// threads open) and portaled popovers render outside the workspace's subtree.
// The newest registration wins; unregistering restores the previous one.

import { useSyncExternalStore } from "react";
import type { RemarkItem, StageRemarkOptions } from "./remarks";

export interface RemarkSink {
  /** Stage one remark into the page's chat (opening the chat when it is hidden). */
  stage(item: RemarkItem, options?: StageRemarkOptions): void;
}

const stack: { token: symbol; sink: RemarkSink }[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of [...listeners]) listener();
}

/** Register `sink` as the page's remark sink. Returns the release. */
export function registerRemarkSink(sink: RemarkSink): () => void {
  const token = Symbol("remark-sink");
  stack.push({ token, sink });
  emit();
  return () => {
    const at = stack.findIndex((entry) => entry.token === token);
    if (at >= 0) stack.splice(at, 1);
    emit();
  };
}

/** The sink a comment posted now would stage into, or null (no chat on this page). */
export function activeRemarkSink(): RemarkSink | null {
  return stack[stack.length - 1]?.sink ?? null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this page has a chat a comment can ride along to (drives the "With next message" switch). */
export function useHasRemarkSink(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => activeRemarkSink() !== null,
    () => false,
  );
}

/** Test seam. */
export function resetRemarkSinksForTest() {
  stack.length = 0;
  emit();
}
