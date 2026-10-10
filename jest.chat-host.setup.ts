/**
 * Jest only: the app's DATA slots for suites that run real `@ai-matrx/chat` code which reaches the
 * kind validator, a chat's records, the shape catalog, the Source Inspector or the full-screen editor
 * (../aidream/apps/shared/chat/src/host/app-data-slots.ts). The formatted-text engine is NOT a slot:
 * chat imports @ai-matrx/rich-content directly, whose host jest.rich-content-host.setup.ts configures.
 *
 * Each slot is registered as a thin wrapper that loads the REAL registration
 * (providers/chatAppDataRegistration) on its first call — after the suite's own `jest.mock` calls —
 * so a suite that never touches these slots loads nothing, and a suite that does sees the real host,
 * never a stub. A suite that registers its own slot afterwards simply overrides it.
 */
import { createElement } from "react";

type Slots = Record<string, unknown>;
const load = (): Slots => require("@/providers/chatAppDataRegistration").chatAppDataSlots;

const FUNCTIONS = ["contentIrKindValidator", "useAnchorRecords", "fetchShapePage", "fetchShapeByKind", "useOpenCitationSource"];
const COMPONENTS = ["AnchorRecordsList", "FullScreenMarkdownEditor"];

const lazy: Slots = {};
for (const name of FUNCTIONS) {
  lazy[name] = (...args: unknown[]) => (load()[name] as (...a: unknown[]) => unknown)(...args);
}
for (const name of COMPONENTS) {
  const Lazy = (props: object) => createElement(load()[name] as never, props);
  Lazy.displayName = `LazyChatHost(${name})`;
  lazy[name] = Lazy;
}
// STOPGAP (delete with the one in jest.setup.ts once @ai-matrx/chat's ui-slots stops pulling the
// store/host-db at import): queued, run in a beforeAll by jest.chat-ui-deferred.setup.ts.
((globalThis as { __deferredChatUi?: Array<() => void> }).__deferredChatUi ??= []).push(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@ai-matrx/chat/host/ui-slots") as typeof import("@ai-matrx/chat/host/ui-slots")).registerChatUi(lazy as never);
});
