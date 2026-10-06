/**
 * The assist ACTIONS — every capability an accepted assist chip executes,
 * contributed to the app's ONE action registry (`@ai-matrx/alchemy`'s) as the
 * provider `assists.actions`.
 *
 * Each `AssistAction["kind"]` becomes the registry Action `assist.<kind>`:
 * programmatic-only (alchemy `invocableAction`), run by id through alchemy's `invokeAction`
 * (wrapped by content-ir's `invoked-actions.ts`), which `useAssistRunner` calls. A new
 * kind is one handler file exporting an `AssistActionDefinition` plus one line
 * in `ASSIST_ACTIONS` below.
 */

import { invokedActionProvider } from "@/features/content-ir/react/actions/invoked-actions";
import type { AssistActionDefinition } from "./assist-action-types";
import { applyKeywordMeaningAssistAction } from "./handlers/apply-keyword-meaning";
import { applyPageMetaAssistAction } from "./handlers/apply-page-meta";
import { launchAgentAssistAction } from "./handlers/launch-agent";
import { runMandateAssistAction } from "./handlers/run-mandate";
import { navigateAssistAction } from "./handlers/navigate";
import { openInOwnBrowserAssistAction } from "./handlers/open-in-own-browser";
import { openApprovalQueueAssistAction } from "./handlers/open-approval-queue";
import { serverActionAssistAction } from "./handlers/server-action";
import { surfaceWriteAssistAction } from "./handlers/surface-write";

export const ASSIST_ACTIONS_PROVIDER_ID = "assists.actions";

/** Every assist action, in one list (the census test pins it). */
export const ASSIST_ACTIONS: readonly AssistActionDefinition[] = [
  applyKeywordMeaningAssistAction,
  applyPageMetaAssistAction,
  launchAgentAssistAction,
  runMandateAssistAction,
  navigateAssistAction,
  openInOwnBrowserAssistAction,
  openApprovalQueueAssistAction,
  serverActionAssistAction,
  surfaceWriteAssistAction,
];

/** The registry id of the action that executes an assist of this kind. */
export function assistActionId(kind: string): string {
  return `assist.${kind}`;
}

export const assistActionProvider = invokedActionProvider(
  ASSIST_ACTIONS_PROVIDER_ID,
  ASSIST_ACTIONS.map((def) => ({
    id: assistActionId(def.kind),
    label: def.label,
    description: def.description,
    handler: def.handler,
  })),
);
