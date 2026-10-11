/**
 * The kind-component ACTIONS — every capability a rendered kind component can
 * trigger with `runAction(key, input)`, contributed to the app's ONE action
 * registry (`@ai-matrx/alchemy`'s) as the provider `content-ir.kind-actions`.
 *
 * The vision (Arman, 2026-07-23): a component can trigger ANY safe capability,
 * and the list grows to hundreds. Components call one function (injected by
 * `useKindActionRunner`); a new capability is one handler file exporting a
 * `KindActionDefinition` plus one line in `KIND_ACTIONS` below — never a
 * sandbox, compiler or prop-shape change.
 *
 * Each key becomes the registry Action `kind.<key>`: programmatic-only (never in a menu),
 * run by id through alchemy's `invokeAction` (`invoked-actions.ts`). The two non-negotiables live in
 * the runner: it never throws into component code, and a handler receives only
 * the capability-scoped `KindActionContext`.
 */

import type { KindActionDefinition } from "./kind-action-context";
import { invokedActionProvider } from "./invoked-actions";
import { triggerAgentAction } from "./handlers/trigger-agent";
import { applySurfaceWriteAction } from "./handlers/apply-surface-write";
import { listSurfaceWriteTargetsAction } from "./handlers/list-surface-write-targets";
import { runShortcutAction } from "./handlers/run-shortcut";
import { saveItemStateAction } from "./handlers/save-item-state";
import { openFileAction, shareFileAction } from "./handlers/open-file";

export const KIND_ACTIONS_PROVIDER_ID = "content-ir.kind-actions";

/** Every kind action, in one list (the census tests pin it). */
export const KIND_ACTIONS: readonly KindActionDefinition[] = [
  triggerAgentAction,
  applySurfaceWriteAction,
  listSurfaceWriteTargetsAction,
  runShortcutAction,
  saveItemStateAction,
  openFileAction,
  shareFileAction,
];

/** The registry id of the action a component names by `key`. */
export function kindActionId(key: string): string {
  return `kind.${key}`;
}

export const kindActionProvider = invokedActionProvider(
  KIND_ACTIONS_PROVIDER_ID,
  KIND_ACTIONS.map((def) => ({
    id: kindActionId(def.key),
    label: def.label,
    description: def.description,
    handler: def.handler,
  })),
);
