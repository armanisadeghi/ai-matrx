// packages/chat/src/store/middlewares.ts
//
// The chat package's middlewares, IN THEIR REQUIRED ORDER (PACKAGE-INDEPENDENCE.md §2.2, P2).
// A host store places `...chatMiddlewares()` as one contiguous run exactly where these six sat;
// `createChatStore()` uses the same list. Order drift once dropped `inboxTurnEnd` (W-34), so
// `chat-slices-mount-under-the-same-keys.test.ts` pins this order and the host's placement.
//
// A function, not an array constant: an array literal captures each middleware binding when
// this module evaluates, and under an import cycle (middleware -> ... -> host store -> here)
// that can capture `undefined`. Called at store build time, every binding is settled.

import type { Middleware } from "@reduxjs/toolkit";
import { agentCacheBustMiddleware } from "../agents/redux/agent-definition/cache-bust-middleware";
import { composerDraftMiddleware } from "../agents/redux/execution-system/instance-user-input/composer-draft.middleware";
import { unsentLaunchMiddleware } from "../agents/redux/execution-system/instance-user-input/unsent-launch.middleware";
import { inboxTurnEndMiddleware } from "../agents/redux/execution-system/inbox/inbox-turn-end.middleware";
import { launchHandleReleaseMiddleware } from "../agents/redux/execution-system/instance-ui-state/launch-handle-release.middleware";
import { runConfigurationPersistMiddleware } from "../agents/redux/execution-system/instance-ui-state/run-configuration-persist";

export function chatMiddlewares() {
  return [
    agentCacheBustMiddleware,
    composerDraftMiddleware,
    unsentLaunchMiddleware,
    inboxTurnEndMiddleware,
    launchHandleReleaseMiddleware,
    runConfigurationPersistMiddleware,
  ] as const satisfies readonly Middleware[];
}
